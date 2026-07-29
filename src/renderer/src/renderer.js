const tabsEl = document.getElementById('tabs')
document.getElementById('addBtn').addEventListener('click', () => window.tabAPI.createTab())

function esc(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}


// ── tab rendering ─────────────────────────────────────────────────────────────

window.tabAPI.onTabsUpdated((tabs) => {
    tabsEl.innerHTML = ''
    tabs.forEach((tab) => {
        const el = document.createElement('div')
        el.className = 'tab' + (tab.active ? ' active' : '')
        el.innerHTML = `
            <div class="tab-dot"></div>
            <span class="tab-title">${esc(tab.title)}</span>
            <span class="tab-close" data-close="${tab.index}">×</span>
        `

        // left-click: switch / close button
        el.addEventListener('click', (e) => {
            const closeIndex = e.target.dataset.close
            if (closeIndex !== undefined) {
                window.tabAPI.closeTab(parseInt(closeIndex))
            } else {
                window.tabAPI.switchTab(tab.index)
            }
        })

        // middle-click: close tab
        el.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                e.preventDefault()
                window.tabAPI.closeTab(tab.index)
            }
        })

        // right-click: native context menu (rendered by main process)
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            window.tabAPI.showContextMenu(tab.index)
        })

        tabsEl.appendChild(el)
    })
})
