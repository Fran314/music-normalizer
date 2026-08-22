import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

import * as mm from 'music-metadata'
import NodeID3 from 'node-id3'

const SUPPORTED_TYPES = [
    '.mp3',
    '.flac',
    '.m4a',
    '.wav',
    '.ogg',
    '.opus',
    '.webm',
]

const HELP = `Usage: music-normalizer [OPTIONS] <source> [sources...] <dest>

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

  -j, --jobs <N>            Number of files to process in parallel.
                            Defaults to the number of CPU cores minus one.

  --tagsOnly                Only transfer metadata from source to destination
                            without processing audio.

Examples:
  # Normalize a single file
  music-normalizer song.mp3 output.mp3

  # Normalize a file to a directory
  music-normalizer song.mp3 dest/

  # Normalize multiple files to a directory
  music-normalizer song1.mp3 song2.flac song3.m4a dest/

  # Process a directory recursively (flattened)
  music-normalizer input_dir/ dest/

  # Process a directory and keep structure
  music-normalizer -k input_dir/ dest/

  # Copy without re-encoding (MP3 only)
  music-normalizer -c song.mp3 dest/

  # Only update tags
  music-normalizer --tagsOnly song.mp3 output.mp3

Notes:
  - All output files are converted to MP3 format at 192k bitrate
  - Audio is normalized to -14 LUFS (Spotify standard)
  - Silence is removed from beginning and end
`

const exitError = e => {
    console.log(HELP)
    console.error(`Error: ${e}`)
    process.exit(1)
}
const parseArgs = args => {
    const result = {
        copy: false,
        keepStructure: false,
        tagsOnly: false,
        jobs: Math.max(1, os.cpus().length - 1),
        sources: [],
        dest: null,
    }

    const positionals = []

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg === '--help' || arg === '-h') {
            console.log(HELP)
            process.exit(0)
        } else if (arg === '--copy' || arg === '-c') {
            result.copy = true
        } else if (arg === '--keepStructure' || arg === '-k') {
            result.keepStructure = true
        } else if (arg === '--tagsOnly') {
            result.tagsOnly = true
        } else if (arg === '--jobs' || arg === '-j') {
            const value = args[++i]
            const parsed = parseInt(value, 10)
            if (isNaN(parsed) || parsed < 1) {
                exitError(`invalid value for ${arg}: "${value}"`)
            }
            result.jobs = parsed
        } else if (arg.startsWith('-')) {
            exitError(`unknown option "${arg}"`)
        } else {
            positionals.push(arg)
        }
    }

    if (positionals.length < 2) {
        exitError('You must provide at least one source and one destination.')
    }

    result.dest = positionals[positionals.length - 1]
    result.sources = positionals.slice(0, -1)

    return result
}

const ensureDir = async p => {
    if (!existsSync(p)) {
        await fs.mkdir(p, { recursive: true })
    }
}

const isMp3 = filename => {
    return path.extname(filename).toLowerCase() === '.mp3'
}
const isMusicFile = filename => {
    return SUPPORTED_TYPES.includes(path.extname(filename).toLowerCase())
}

const toDotMp3 = source => {
    const dirname = path.dirname(source)
    const basename = path.basename(source, path.extname(source))
    return path.join(dirname, `${basename}.mp3`)
}

// const getBitrate = async target => {
//     let ffprobeOutput = ''
//
//     const args = [
//         '-v',
//         'error',
//         '-show_entries',
//         'format=bit_rate',
//         '-of',
//         'default=noprint_wrappers=1:nokey=1',
//         target,
//     ]
//     const ffprobe = spawn('ffprobe', args)
//
//     ffprobe.stdout.on('data', data => (ffprobeOutput += data.toString()))
//
//     return await new Promise((resolve, reject) => {
//         ffprobe.on('error', error => reject(error))
//         ffprobe.on('close', code => {
//             if (code !== 0)
//                 return reject(new Error(`ffprobe failed with code ${code}.`))
//
//             const bitrate = parseInt(ffprobeOutput.trim())
//             if (isNaN(bitrate))
//                 return reject(new Error('Failed to parse ffprobe output.'))
//
//             const kbps = Math.round(bitrate / 1000)
//             if (kbps >= 300) resolve('320k')
//             else if (kbps >= 240) resolve('256k')
//             else if (kbps >= 180) resolve('192k')
//             else resolve('128k')
//         })
//     })
// }

const transcode = async (source, dest) => {
    const ffmpegArgs = [
        source,

        // force (overwrite existing files)
        '-f',

        // loudness target (in LUFS, default is -23, Spotify uses -14)
        '-t',
        '-14',

        // strip tags and metadata
        '-mn',

        // normalize volume, remove silence from beginning and end (possibly leaving 1s of silence at the end)
        '-pof',
        'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=2',

        // encode in mp3 (not necessary but added for clarity)
        '-c:a',
        'libmp3lame',

        // set bitrate
        '-b:a',
        '192k',

        // set extension
        '-ext',
        'mp3',

        '-o',
        dest,
    ]

    return await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg-normalize', ffmpegArgs, { detached: true })
        proc.on('error', err => {
            reject(err)
        })
        proc.on('close', code => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`ffmpeg failed with code ${code}`))
            }
        })
    })
}
const transcopy = async (source, dest) => {
    const ffmpegArgs = [
        source,

        // force (overwrite existing files)
        '-f',

        // strip tags and metadata
        '-mn',

        // keep original audio without re-encoding
        '-koa',

        '-o',
        dest,
    ]

    return await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg-normalize', ffmpegArgs, { detached: true })
        proc.on('error', err => {
            reject(err)
        })
        proc.on('close', code => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`ffmpeg failed with code ${code}`))
            }
        })
    })
}

const readTags = async source => {
    try {
        const tags = (await mm.parseFile(source)).common
        return {
            title: tags.title || '',
            artist: tags.artist || '',
            bpm: tags.bpm || '',
            comment: tags.comment || '',
        }
    } catch (error) {
        return {
            title: '',
            artist: '',
            bpm: '',
            comment: '',
        }
    }
}
const writeTags = async (tags, dest) => {
    try {
        const fileBuffer = await fs.readFile(dest)
        const success = NodeID3.write(
            {
                ...tags,
                comment: {
                    language: 'eng',
                    text: tags.comment,
                },
            },
            fileBuffer,
        )
        if (success === false) {
            throw new Error('Failed to write ID3 tags to buffer.')
        }
        await fs.writeFile(dest, success)
    } catch (error) {
        console.error('Error saving file:', error)
    }
}

const findMusicFiles = async (baseDir, currentDir = '') => {
    const fullCurrentDir = path.join(baseDir, currentDir)
    let files = []

    try {
        const entries = await fs.readdir(fullCurrentDir, {
            withFileTypes: true,
        })

        for (const entry of entries) {
            const entryRelativePath = path.join(currentDir, entry.name)

            if (entry.isDirectory()) {
                files = files.concat(
                    await findMusicFiles(baseDir, entryRelativePath),
                )
            } else if (entry.isFile() && isMusicFile(entry.name)) {
                files.push(entryRelativePath)
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${fullCurrentDir}:`, error)
    }

    return files
}

const processFile = async (source, dest, options) => {
    console.log(source)
    const tags = await readTags(source)

    if (!options.tagsOnly) {
        if (options.copy && isMp3(source)) {
            await transcopy(source, dest)
        } else {
            await transcode(source, dest)
        }
    }

    await writeTags(tags, dest)
}

const argv = parseArgs(process.argv.slice(2))

const isDestDir = await fs
    .stat(argv.dest)
    .then(s => s.isDirectory())
    .catch(() => false)

const isSourceSingleFile =
    argv.sources.length == 1 &&
    (await fs
        .stat(argv.sources[0])
        .then(s => s.isFile())
        .catch(() => false))

if (!isDestDir && !isSourceSingleFile) {
    exitError(
        'when specifying multiple sources, destination must be a directory.',
    )
}

const toProcess = []

for (const source of argv.sources) {
    const stats = await fs.stat(source).catch(() => null)

    if (!stats) {
        console.error(`Error: Source not found: ${source}`)
        continue
    }

    if (stats.isDirectory()) {
        const musicFiles = await findMusicFiles(source)

        for (const relSourcePath of musicFiles) {
            const fullSourcePath = path.join(source, relSourcePath)
            const destPath = argv.keepStructure
                ? path.join(argv.dest, toDotMp3(relSourcePath))
                : path.join(argv.dest, toDotMp3(path.basename(relSourcePath)))
            toProcess.push({
                source: fullSourcePath,
                dest: destPath,
            })
        }
    } else if (stats.isFile()) {
        if (!isMusicFile(source)) {
            console.error(
                `Error: File is not a supported music format: ${source}`,
            )
            continue
        }
        const destPath = isDestDir
            ? path.join(argv.dest, toDotMp3(path.basename(source)))
            : argv.dest

        toProcess.push({
            source: source,
            dest: destPath,
        })
    }
}

const runWorker = async () => {
    while (toProcess.length > 0) {
        const curr = toProcess.shift()
        await ensureDir(path.dirname(curr.dest))
        await processFile(curr.source, curr.dest, {
            copy: argv.copy,
            tagsOnly: argv.tagsOnly,
        })
    }
}

try {
    // priority (nice-ness) is inherited by children, so this affects the ffmpeg processes
    os.setPriority(10)
} catch (error) {
    console.error(`Warning: could not lower process priority: ${error.message}`)
}

const workerCount = Math.min(argv.jobs, toProcess.length)
await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
