{
  description = "A flake for my Node.js utility script.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

    in
    {
      packages.x86_64-linux.default = pkgs.callPackage ./default.nix { };
    };
}
