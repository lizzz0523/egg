import fs, { Stats } from 'fs-extra'
import { OrderedList, BufferReader, BufferWriter, writeSha1File } from './share'

export const CACHE_SIGNATURE = 0x44495243
export const CACHE_VERSION = 2

export class CacheHeader {
    signature: number | null = null
    version: number | null = null
    entries: number | null = null

    get bufsize() {
        // 24=signature(4)+version(4)+enteries(4)
        return 12
    }

    readFromBuffer(buffer: Buffer, offset: number = 0): number {
        const reader = new BufferReader(buffer, offset)

        this.signature = reader.readInt32()
        this.version = reader.readInt32()
        this.entries = reader.readInt32()
        
        return reader.offset
    }

    writeToBuffer(buffer: Buffer, offset: number = 0): number {
        const writer = new BufferWriter(buffer, offset)

        writer.writeInt32(this.signature || 0)
        writer.writeInt32(this.version || 0)
        writer.writeInt32(this.entries || 0)
        
        return writer.offset
    }
}

export class CacheEntry {
    ctime: Date | null = null
    mtime: Date | null = null
    dev: number | null = null
    ino: number | null = null
    mode: number | null = null
    uid: number | null = null
    gid: number | null = null
    size: number | null = null
    sha1: string | null = null
    flags: number | null = null
    name: string | null = null

    get namelen() {
        return this.flags ? (this.flags & 0x0fff) : 0
    }

    set namelen(value: number) {
        this.flags = this.flags || 0
        this.flags = (this.flags & 0xf000) | (value & 0x0fff)
    }

    get bufsize() {
        // 62=ctime(8)+mtime(8)+dev(4)+ino(4)+mode(4)+uid(4)+gid(4)+size(4)+sha1(20)+flags(2)
        return 62 + this.namelen
    }

    readFromBuffer(buffer: Buffer, offset: number = 0): number {
        const reader = new BufferReader(buffer, offset)

        this.ctime = reader.readTime()
        this.mtime = reader.readTime()
        this.dev = reader.readInt32()
        this.ino = reader.readInt32()
        this.mode = reader.readInt32()
        this.uid = reader.readInt32()
        this.gid = reader.readInt32()
        this.size = reader.readInt32()
        this.sha1 = reader.readHex(20)
        this.flags = reader.readInt16()
        this.name = reader.readStr(this.namelen)

        return reader.offset
    }

    writeToBuffer(buffer: Buffer, offset: number = 0): number {
        const writer = new BufferWriter(buffer, offset)

        writer.writeTime(this.ctime || new Date)
        writer.writeTime(this.mtime || new Date)
        writer.writeInt32(this.dev || 0)
        writer.writeInt32(this.ino || 0)
        writer.writeInt32(this.mode || 0)
        writer.writeInt32(this.uid || 0)
        writer.writeInt32(this.gid || 0)
        writer.writeInt32(this.size || 0)
        writer.writeHex(this.sha1 || '', 20)
        writer.writeInt32(this.flags || 0)
        writer.writeStr(this.name || '', this.namelen)

        return writer.offset
    }

    fillStatCacheInfo(stats: Stats): void {
        this.ctime = stats.ctime
        this.mtime = stats.mtime
        // 由于我的系统时64位系统，有部分数据是int64
        // 但我在写入buffer时采用的int32（js不支持int64）
        // 因此这里只能暂时使用& 0xffff这样的mask操作
        this.dev = stats.dev & 0xffff
        this.ino = stats.ino & 0xffff
        this.mode = stats.mode & 0xffff
        this.uid = stats.uid & 0xffff
        this.gid = stats.gid & 0xffff
        this.size = stats.size & 0xffff
    }

    async refreshEntry(): Promise<void> {
        if (!this.name) return
        this.fillStatCacheInfo(await fs.stat(this.name))
    }
}

export class Cache {
    header: CacheHeader | null
    entries: OrderedList<CacheEntry>
    
    constructor(header: CacheHeader | null = null, entrices: CacheEntry[] = []) {
        this.header = header
        this.entries = new OrderedList(entrices, 'name')
    }

    async readTree(): Promise<void> {
        
    }

    private async writeTreeRecursively(iter: Iterator<CacheEntry>, basename: string): Promise<string> {
        let buffer = Buffer.alloc(8192)
        let offset = 0

        while (true) {
            const result = iter.next()

            if (result.done) {
                break
            }

            const entry = result.value

            if (!entry.name ||
                !entry.sha1 ||
                !entry.mode) {
                continue
            }

            const pathname = entry.name
            let sha1 = entry.sha1
            let mode = entry.mode

            const baselen = basename.length
            const filename = pathname.substr(baselen)
            const seppos = filename.indexOf('/')
            const dirname = seppos > 0 ? filename.substr(0, seppos) : ''

            if (dirname) {
                sha1 = await this.writeTreeRecursively(iter, basename + dirname + '/')
                mode = fs.constants.S_IFDIR
            }

            const entryname = dirname || filename
            const entrylen = entryname.length

            if (offset + entrylen + 100 > buffer.length) {
                buffer = Buffer.alloc(offset + entrylen + 100).fill(buffer)
            }

            offset += buffer.write(`${mode} ${entryname}\0${sha1}`, offset)
        }

        return await writeSha1File(buffer, offset, 'tree')
    }

    async writeTree(): Promise<string> {
        const iter = this.entries.iterator()
        return await this.writeTreeRecursively(iter, '')        
    }

    async refreshCache(): Promise<void> {
        for (const entry of this.entries) {
            await entry.refreshEntry()
        }
    }

    async addFileToCache(file: string): Promise<void> {
        let stats

        try {
            stats = await fs.stat(file)
        } catch (error) {
            return
        }
        
        if (stats.isDirectory()) {
            return
        }

        const entry = new CacheEntry
        entry.fillStatCacheInfo(stats)
        entry.name = file
        entry.namelen = Buffer.byteLength(file)
        // 文件写入odb，并获取sha1
        entry.sha1 = await this.indexFile(file)

        this.entries.add(entry)
    }

    private async indexFile(file: string, type: string = 'blob'): Promise<string> {
        const buffer = await fs.readFile(file)
        const size = buffer.length

        return await writeSha1File(buffer, size, type)
    }
}