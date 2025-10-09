{
  buildNpmPackage,
  lib,
  nodejs,
}:

buildNpmPackage {
  pname = "music-normalizer";

  version = "1.0.0";

  src = ./.;

  npmDepsHash = "sha256-QB7Cd4VFVpJAb64k/kQdzr4J5wfJYu0cT3g1mFmhDsU=";

  dontNpmBuild = true;

  nodejs = nodejs;
}
