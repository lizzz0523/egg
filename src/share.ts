import fs from 'fs-extra'
import zlib from 'zlib'
import crypto from 'crypto'
import { Stream } from 'stream'
import { EGG_DIR } from './config';

export function finished(stream: Stream) {
    return new Promise((resolve, reject) => {
        stream.once('finish', () => {
            stream.removeAllListeners()
            resolve()
        })

        stream.once('error', error => {
            stream.removeAllListeners()
            reject(error)
        })
    })
}

export function sha1Filename(sha1: string): string {
    return `${EGG_DIR}/objects/${sha1.slice(0, 2)}/${sha1.slice(2)}`
}

export async function hasSha1File(sha1: string): Promise<boolean> {
    try {
        await fs.stat(sha1Filename(sha1))
        return true
    } catch (error) {
        return false
    }
}

export async function getSha1File(file: string | Buffer): Promise<string> {
    const buffer = typeof file === 'string' ? await fs.readFile(file) : file
    const hash = crypto.createHash('sha1').update(buffer)
    
    return hash.digest('hex')
}

export async function writeSha1File(file: string | Buffer, size: number, type: string): Promise<string> {
    const buffer = typeof file === 'string' ? await fs.readFile(file) : file
    const header = `${type} ${size}\0`

    const hash = crypto.createHash('sha1')
    hash.update(header)
    hash.update(buffer)
    
    const sha1 = hash.digest('hex')

    if (await hasSha1File(sha1)) {
        return sha1
    }

    const output = fs.createWriteStream(sha1Filename(sha1))
    const deflate = zlib.createDeflate({ level: zlib.constants.Z_BEST_COMPRESSION })

    deflate.pipe(output)
    deflate.write(header)
    deflate.write(buffer)
    deflate.end()

    await finished(output)

    return sha1
}

export class BufferReader {
    buffer: Buffer
    offset: number

    constructor(buffer: Buffer, offset: number = 0) {
        this.buffer = buffer
        this.offset = offset
    }

    readInt32(): number {
        const value = this.buffer.readUInt32LE(this.offset)
        this.offset += 4
        return value
    }

    readInt16(): number {
        const value = this.buffer.readUInt16LE(this.offset)
        this.offset += 2
        return value
    }

    readHex(length: number): string {
        const value = this.buffer.toString('hex', this.offset, this.offset + length)
        this.offset += length
        return value
    }

    readStr(length: number): string {
        const value = this.buffer.toString('utf-8', this.offset, this.offset + length)
        this.offset += length
        return value
    }

    readTime(): Date {
        const sec = this.readInt32()
        const nsec = this.readInt32()

        const time = new Date(sec)
        time.setMilliseconds(nsec / 1000)

        return time
    }
}

export class BufferWriter {
    buffer: Buffer
    offset: number

    constructor(buffer: Buffer, offset: number = 0) {
        this.buffer = buffer
        this.offset = offset
    }

    writeInt32(value: number): void {
        this.offset = this.buffer.writeUInt32LE(value, this.offset)
    }

    writeInt16(value: number): void {
        this.offset = this.buffer.writeUInt16LE(value, this.offset)
    }

    writeHex(value: string, length: number): void {
        this.offset += this.buffer.write(value, this.offset, length, 'hex')
    }

    writeStr(value: string, length: number): void {
        this.offset += this.buffer.write(value, this.offset, length, 'utf-8')
    }

    writeTime(value: Date): void {
        const sec = value.getSeconds()
        const nsec = value.getMilliseconds() * 1000

        this.writeInt32(sec)
        this.writeInt32(nsec)
    }
}

export class OrderedList<T> {
    private list_: T[]
    private orderBy_: keyof T

    constructor(list: T[], orderBy: keyof T) {
        this.list_ = list
        this.orderBy_ = orderBy
    }

    get size() {
        return this.list_.length
    }

    private compare(a: T, b: T): number {
        const av = a[this.orderBy_]
        const bv = b[this.orderBy_]

        return av === bv ? 0 : av > bv ? 1 : -1
    }

    // 二分查找
    private search(item: T): number {
        let first = 0
        let last = this.list_.length

        while (last > first) {
            const next = (first + last) >> 1
            const comp = this.compare(item, this.list_[next])

            if (comp === 0) {
                return next
            }

            if (comp < 0) {
                last = next
            } else {
                first = next + 1
            }
        }

        return -first - 1
    }

    has(item: T): boolean {
        return this.search(item) >= 0
    }

    add(item: T): void {
        const index = this.search(item)

        if (index >= 0) {
            return
        }

        this.list_.splice(-index - 1, 0, item)
    }

    remove(item: T): void {
        const index = this.search(item)

        if (index < 0) {
            return
        }

        this.list_.splice(index, 1)
    }

    *iterator(): Iterator<T> {
        for (let i = 0; i < this.list_.length; i++) {
            yield this.list_[i]
        }
    }

    *[Symbol.iterator](): Iterator<T> {
        return this.iterator()
    }
}