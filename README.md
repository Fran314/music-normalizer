# Music Normalizer

This script is a small utility that I use to normalize music files. It converts
files to `.mp3` (eventually just copying without re-encoding when specified),
normalizes the loudness and removes silence from the beginning and end.

Requires to have installed both `ffmpeg` and `ffmpeg-normalize`

## Usage

```
music-normalize <source> <dest> [OPTIONS]

Normalize music files.

Positionals:
  source  Path to the source file. In recursive mode, the source must be a
          directory                                                     [string]
  dest    Path to the destination. In normal mode, this can be either a path to
          a file (new or existing), or a path to a directory, in which case the
          name of the source will be appended. In recursive mode, this must be a
          directory                                                     [string]

Options:
      --version        Show version number                             [boolean]
  -c, --copy           Copy audio instead of re-encoding (supported only for
                       .mp3 sources)                  [boolean] [default: false]
  -r, --recursive      Enable recursive mode (source and dest must be
                       directories)                   [boolean] [default: false]
  -k, --keepStructure  In recursive mode, preserve the directory structure of
                       the source to the destination  [boolean] [default: false]
      --tagsOnly       In normal mode, only transfer metadata from source to
                       dest                           [boolean] [default: false]
  -h, --help           Show help                                       [boolean]
```
