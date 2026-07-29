{
  description = "Unofficial Linux desktop client for Linear (linear.app)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      version = "0.2.10";

      sources = {
        x86_64-linux = {
          url = "https://github.com/rayleigh420/linear-linux/releases/download/v${version}/linear-linux-${version}-x86_64.AppImage";
          hash = "sha256-WZ+TLYrrc2w4BDe89mVVCo8Vio7V5H6Xu5NIujo3mTo="; # x86_64
        };
        aarch64-linux = {
          url = "https://github.com/rayleigh420/linear-linux/releases/download/v${version}/linear-linux-${version}-arm64.AppImage";
          hash = "sha256-8up8jYlxICC6B0V26ifRmURrcxXlAtFgP9UNuKBMp9U="; # aarch64
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
        in
        {
          linear-linux = pkgs.appimageTools.wrapType2 {
            pname = "linear-linux";
            inherit version src;

            extraInstallCommands =
              let
                appimageContents = pkgs.appimageTools.extractType2 {
                  pname = "linear-linux";
                  inherit version src;
                };
              in
              ''
                # Install desktop file
                install -Dm644 ${appimageContents}/linear-linux.desktop \
                  $out/share/applications/linear-linux.desktop
                substituteInPlace $out/share/applications/linear-linux.desktop \
                  --replace-warn 'Exec=AppRun' 'Exec=linear-linux'

                # Install icons
                install -Dm644 ${appimageContents}/usr/share/icons/hicolor/1024x1024/apps/linear-linux.png \
                  $out/share/icons/hicolor/1024x1024/apps/linear-linux.png
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
