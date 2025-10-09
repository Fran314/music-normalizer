import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import * as mm from 'music-metadata'
import NodeID3 from 'node-id3'

const SUPPORTED_TYPES = ['.mp3', '.flac']
const ALLOWED_GENRES = ['boogie woogie', 'lindy hop']

const argv = yargs(hideBin(process.argv))
    .command('$0 <source> <dest>', 'Normalize music files.', yargs => {
        return yargs
            .positional('source', {
                describe:
                    'Path to the source file. In recursive mode, the source must be a directory',
                type: 'string',
            })
            .positional('dest', {
                describe:
                    'Path to the destination. In normal mode, this can be either a path to a file (new or existing), or a path to a directory, in which case the name of the source will be appended. In recursive mode, this must be a directory',
                type: 'string',
            })
    })
    .option('copy', {
        alias: 'c',
        type: 'boolean',
        description:
            'Copy audio instead of re-encoding (supported only for .mp3 sources)',
        default: false,
    })
    .option('recursive', {
        alias: 'r',
        type: 'boolean',
        description:
            'Enable recursive mode (source and dest must be directories)',
        default: false,
    })
    .option('keepStructure', {
        alias: 'k',
        type: 'boolean',
        description:
            'In recursive mode, preserve the directory structure of the source to the destination',
        default: false,
    })
    .option('tagsOnly', {
        type: 'boolean',
        description:
            'In normal mode, only transfer metadata from source to dest',
        default: false,
    })
    .demandCommand(2, 'You must provide both a source and a destination.')
    .help()
    .alias('help', 'h')
    .strict().argv

export const ensureDir = async p => {
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

function toDotMp3(source) {
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

const formatGenres = genres => {
    if (!genres) return ''

    const filtered = genres
        .flatMap(g => g.split(',').map(subG => subG.trim().toLowerCase()))
        .filter(g => ALLOWED_GENRES.includes(g))

    const unique = [...new Set(filtered)].sort()
    return unique
}
const readTags = async source => {
    try {
        const tags = (await mm.parseFile(source)).common
        return {
            title: tags.title || '',
            artist: tags.artist || '',
            genre: formatGenres(tags.genre),
            bpm: tags.bpm || '',
            comment:
                tags.comment && tags.comment.length > 0 ? tags.comment[0] : '',
        }
    } catch (error) {
        return { title: '', artist: '', genre: '', bpm: '', comment: '' }
    }
}
const writeTags = async (tags, dest) => {
    try {
        const fileBuffer = await fs.readFile(dest)
        const success = NodeID3.write(tags, fileBuffer)
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

const processFile = async (source, dest, copy) => {
    const tags = await readTags(source)
    if (copy && isMp3(source)) {
        await transcopy(source, dest)
    } else {
        await transcode(source, dest)
    }
    await writeTags(tags, dest)
}

if (argv.recursive) {
    const sources = await findMusicFiles(argv.source)
    for (const relSource of sources) {
        const source = path.join(argv.source, relSource)
        const dest = argv.keepStructure
            ? path.join(argv.dest, relSource)
            : path.join(argv.dest, path.basename(relSource))

        console.log(source)
        ensureDir(path.dirname(dest))
        const tags = await readTags(source)
        if (argv.copy && isMp3(source)) {
            await transcopy(source, dest)
        } else {
            await transcode(source, dest)
        }
        await writeTags(tags, dest)
    }
} else {
    const isDestDir = await fs
        .stat(argv.dest)
        .then(s => s.isDirectory())
        .catch(() => false)

    const source = argv.source
    const dest = isDestDir
        ? path.join(argv.dest, toDotMp3(path.basename(source)))
        : argv.dest

    const tags = await readTags(source)
    if (!argv.tagsOnly) {
        if (argv.copy && isMp3(source)) {
            await transcopy(source, dest)
        } else {
            await transcode(source, dest)
        }
    }
    await writeTags(tags, dest)
}
