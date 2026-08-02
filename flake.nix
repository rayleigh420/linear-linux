{
  description = "Unofficial Linux desktop client for Linear (linear.app)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      version = "0.2.56";

      sources = {
        x86_64-linux = {
          url = "https://github.com/rayleigh420/linear-linux/releases/download/v${version}/linear-linux-${version}-x86_64.AppImage";
          hash = "sha256-Yjpn0xY08zSwGoWN5n6b051bTx7kIPrReAi6Tqfci1k="; # x86_64
        };
        aarch64-linux = {
          url = "https://github.com/rayleigh420/linear-linux/releases/download/v${version}/linear-linux-${version}-arm64.AppImage";
          hash = "sha256-f7cJPaK37dXdZEJ2m4nJmAXaU0qf4o3ewwDAJiYD/Zg="; # aarch64
        };
      };

      forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ];
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          src = pkgs.fetchurl {
            url = sources.${system}.url;
            hash = sources.${system}.hash;
          };
          appimageContents = pkgs.appimageTools.extractType2 {
            pname = "linear-linux";
            inherit version src;
          };
          unwrapped = pkgs.appimageTools.wrapType2 {
            pname = "linear-linux";
            inherit version src;

            extraInstallCommands = ''
              install -Dm644 ${appimageContents}/linear-linux.desktop \
                $out/share/applications/linear-linux.desktop
              substituteInPlace $out/share/applications/linear-linux.desktop \
                --replace-warn 'Exec=AppRun' 'Exec=linear-linux'

              install -Dm644 ${appimageContents}/usr/share/icons/hicolor/1024x1024/apps/linear-linux.png \
                $out/share/icons/hicolor/1024x1024/apps/linear-linux.png
            '';
          };
        in
        {
          linear-linux = pkgs.symlinkJoin {
            name = "linear-linux-${version}";
            paths = [ unwrapped ];
            nativeBuildInputs = [ pkgs.makeWrapper ];
            postBuild = ''
              wrapProgram $out/bin/linear-linux \
                --add-flags "--no-sandbox --disable-dev-shm-usage --font-render-hinting=none"
            '';
            meta = with pkgs.lib; {
              description = "Unofficial Linux desktop client for Linear (linear.app)";
              homepage = "https://github.com/rayleigh420/linear-linux";
              license = licenses.isc;
              platforms = [ "x86_64-linux" "aarch64-linux" ];
              mainProgram = "linear-linux";
            };
          };

          default = self.packages.${system}.linear-linux;
        }
      );
    };
}
