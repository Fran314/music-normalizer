{
  buildNpmPackage,
  lib,
  nodejs,
}:

buildNpmPackage {
  pname = "music-normalizer";

  version = "1.0.0";

  src = ./.;

  npmDepsHash = "sha256-qqxKNUMTgH2GrRRPNg6VvH3IRdDNO2HTS1qWIoM+0Ew=";

  dontNpmBuild = true;

  nodejs = nodejs;
}
