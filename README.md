# Music Normalizer

This script is a small utility that I use to normalize music files. It converts
files to `.mp3` (eventually just copying without re-encoding when specified),
normalizes the loudness and removes silence from the beginning and end.

Requires to have installed both `ffmpeg` and `ffmpeg-normalize`

## Usage

```
music-normalizer [OPTIONS] <source> [sources...] <dest>

Normalize music files with consistent volume and remove silence.

Arguments:
  <source(s)>               One or more source file(s) or directory(ies).
                            Files must be .mp3, .flac, or .m4a format.
                            Directories are processed recursively.
  
  <dest>                    Destination file or directory.
                            - With a single file source: can be a file or directory
                            - With multiple sources or directory sources: must be a directory

Options:
  -h, --help                Show this help message and exit
  
  -c, --copy                Copy audio instead of re-encoding (MP3 sources only).
                            Faster but skips normalization and silence removal.
  
  -k, --keepStructure       When processing directories, preserve the directory
                            structure in the destination. By default, all files
                            are flattened into the destination directory.
  
  --tagsOnly                Only transfer metadata from source to destination
                            without processing audio.

Examples:
  # Normalize a single file
  node index.js song.mp3 output.mp3
  
  # Normalize a file to a directory
  node index.js song.mp3 dest/
  
  # Normalize multiple files to a directory
  node index.js song1.mp3 song2.flac song3.m4a dest/
  
  # Process a directory recursively (flattened)
  node index.js input_dir/ dest/
  
  # Process a directory and keep structure
  node index.js -k input_dir/ dest/
  
  # Copy without re-encoding (MP3 only)
  node index.js -c song.mp3 dest/
  
  # Only update tags
  node index.js --tagsOnly song.mp3 output.mp3

Notes:
  - All output files are converted to MP3 format at 192k bitrate
  - Audio is normalized to -14 LUFS (Spotify standard)
  - Silence is removed from beginning and end
```
