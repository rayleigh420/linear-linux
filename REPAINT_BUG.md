# WebContentsView Black-Panel on Drag-to-Split — RESOLVED

**Status:** ✅ Fixed. Platform: GNOME 47+ / Ubuntu / **native Wayland** (Mutter), display scale 1.25x, Electron 43.

## Triệu chứng

Kéo một tab sang cạnh phải để split đôi window → sau khi thả chuột, panel bên phải
(và đôi khi cả hai) **đen hoàn toàn**. Chỉ khi user **click vào window** thì nó mới hiện.
`capturePage()` luôn báo view có nội dung (0% black) — tức renderer vẽ xong, chỉ là
**không được present lên màn hình**.

---

## Root cause — có HAI lỗi độc lập, phải fix cả hai

### Lỗi 1 — `resume-all` không chạy đáng tin cậy (drag-end không bắt được)

Trong lúc drag tab, code "suspend" các view (gỡ chúng ra) để dockview nhận được mouse
event cho drop-zone, rồi "resume" khi thả. Resume được kích hoạt bằng listener `mouseup`.

**Nhưng dockview kéo tab bằng HTML5 drag-and-drop.** Khi `dragstart` xảy ra, browser vào
chế độ DnD và **chặn `mousemove`/`mouseup`** — drag kết thúc bằng `dragend`/`drop`.
Tệ hơn: khi thả, **dockview xoá/tạo lại DOM element của tab** (chuyển sang group mới), nên
`dragend` fire trên một node đã rời khỏi DOM → **không bubble tới `window`** → listener
không bao giờ nhận → `resume-all` không chạy → view kẹt ở trạng thái detached → đen.

Đây là lý do bug "chập chờn": đôi khi `mouseup` may mắn fire, đa số thì không.

### Lỗi 2 — Chromium không present view đã reposition cho tới khi có xdg configure thật

Kiến trúc thật (xác nhận bằng `WAYLAND_DEBUG=1`): app là **một `wl_surface` DUY NHẤT**.
GPU process của Chromium composite **mọi WebContentsView vào một buffer** rồi attach vào
surface đó (scale bằng `wp_viewport`). **Không có `wl_subsurface` nào** — mọi giả định
subsurface trong tài liệu cũ là sai.

Trên GNOME Wayland, khi một view bị reposition/re-attach, Chromium ghi trạng thái surface
mới ở dạng **pending** và chỉ apply nó khi có **một frame submission mang thay đổi hình
ảnh thật** (khớp [electron#51808](https://github.com/electron/electron/issues/51808)):

> *ApplyPendingState() is invoked solely from WaylandFrameManager on frame submission…
> if the surface is visually identical to the prior frame, the request is effectively dropped.*

Cú click của user tạo state-change ở tầng native Ozone (Wayland pointer → focus/occlusion
recompute) → frame thật → pending apply → hết đen.

**Tất cả cách rẻ hơn đều THẤT BẠI** (đã thử và xác nhận qua log):
`setSize`/size-nudge (bị `wp_viewport` hấp thụ, không tạo configure) · DOM opacity trick ·
`setBackgroundColor` · `webContents.invalidate()` · `sendInputEvent` · scroll thật ·
`webContents.focus()` · `removeChildView`+`addChildView` đơn thuần · `ui-disable-partial-swap`
(damage full nhưng buffer vẫn đen) · maximize/setSize làm quá nhanh (bị Mutter coalesce).

Chỉ **một xdg_toplevel state change thật** (maximize/fullscreen toggle) mới buộc Mutter gửi
`configure` → Electron `ack_configure` → full recomposite → flush toàn bộ pending state.

---

## Giải pháp

### Fix lỗi 1 — resume đáng tin cậy (`webviewManager.ts` + `App.tsx`)

Dùng **signal quyền lực của dockview** thay vì đoán qua DOM event:

- `App.tsx`: `api.onDidLayoutChange(() => onDockviewLayoutChange())` — fire khi split hoàn tất.
- `webviewManager.ts`: giữ hook `resumeActiveDrag` khi đang suspend; `onDockviewLayoutChange()`
  gọi nó để resume. Vẫn giữ `mouseup`/`dragend` làm backup, và **safety timer 2s** ép resume
  nếu mọi signal đều trượt (view không bao giờ kẹt đen vĩnh viễn).

### Fix lỗi 2 — native reconfigure (`viewManager.ts`)

- **Suspend = detach hẳn** (`removeChildView`), KHÔNG dùng trick `setBounds` `1×1` off-screen
  cũ (cái đó làm GPU tear down layer). Resume = `addChildView` lại → layer GPU tươi.
- Sau khi re-attach + setBounds mọi view, gọi **`nativeReconfigure(win)` đúng MỘT lần**:
  toggle maximized state → configure round-trip thật → present tất cả view.
- Giữ **thumbnail đông cứng** cho tới khi reconfigure xong mới gỡ (giảm nháy nội dung).

### Flags (`index.ts`)

Không cần flag đặc biệt nào cho bug này. Chỉ giữ bộ flag Linux cơ bản sẵn có
(`CalculateNativeWinOcclusion` disable, v.v.). Các flag từng thử — `WaylandFractionalScaleV1`,
`ui-disable-partial-swap` — **không phải nguyên nhân**, đã gỡ.

---

## Cách chẩn đoán lại (nếu tái phát)

```bash
rm -f /tmp/wl.log
WAYLAND_DEBUG=1 npm run start > /tmp/wl.log 2>&1
# → drag split → thả → đợi 3s → thoát (đừng click, click sẽ che lỗi)
```

Điểm cần nhìn trong `/tmp/wl.log`:
- `[WCV-RENDERER] drag-end … resume-all` — resume có chạy không? (lỗi 1)
- `nativeReconfigure … maximize toggle` + `xdg_toplevel … unset_maximized/set_maximized` +
  `xdg_toplevel.configure(...)` — reconfigure có tạo configure round-trip thật không? (lỗi 2)
- Chỉ có **một** `wl_surface` được attach/damage/commit → xác nhận model single-surface.

## Hạn chế còn lại

`nativeReconfigure` toggle maximized → GNOME animate resize một nhịp ngắn. Đây là cái giá của
việc buộc một xdg configure thật; Wayland không cho client tạo configure mà không đổi state.

## File liên quan

```
src/main/index.ts        — Linux Chromium flags (đã dọn)
src/main/viewManager.ts  — nativeReconfigure(), suspend=detach / resume=reattach, IPC
src/renderer/src/App.tsx          — onDidLayoutChange → resume hook
src/renderer/src/webviewManager.ts — drag suspend/resume lifecycle, thumbnail overlay
```
