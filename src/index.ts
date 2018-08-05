import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import { BufferReader, getSha1File, finished } from './share'
import { Cache, CacheHeader, CacheEntry, CACHE_SIGNATURE, CACHE_VERSION } from './cache'

export class IndexFile {
    static indexFiles: IndexFile[] = []

    static async holdIndexFileForUpdate(file: string): Promise<IndexFile> {
        const indexFile = new IndexFile(file)
        
        try {
            await indexFile.lock()
        } catch (err) {
            process.exit(1)
        }

        this.indexFiles.push(indexFile)

        return indexFile
    }

    static async releaseIndexFile(indexFile: IndexFile, unlock: boolean = false): Promise<void> {
        const index = this.indexFiles.indexOf(indexFile)

        if (index > -1) {
            this.indexFiles.splice(index, 1)
        }

        if (unlock) {
            await indexFile.unlock()
        }
    }

    static removeLockFile(): void {
        this.indexFiles.map(indexFile => indexFile.unlockSync())
    }

    private fd_: number | null = null
    private file_: string
    private lockfile_: string

    constructor(file: string) {
        this.file_ = file
        this.lockfile_ = path.format({ name: file, ext: '.lock' })
    }

    async lock(): Promise<void> {
        // 这里采用wx+打开文件，如果文件已经存在，直接抛异常退出
        this.fd_ = await fs.open(this.lockfile_, 'wx+')
    }

    async unlock(): Promise<void> {
        if (!this.fd_) return
        await fs.close(this.fd_)
        await fs.unlink(this.lockfile_)
    }

    // 同步版本，在exit时，只能用同步的版本
    unlockSync(): void {
        if (!this.fd_) return
        fs.closeSync(this.fd_)
        fs.unlinkSync(this.lockfile_)
    }

    async verify(header: CacheHeader, buffer: Buffer): Promise<boolean> {
        if (header.signature !== CACHE_SIGNATURE)
            return false
        if (header.version !== CACHE_VERSION)
            return false
        
        const offset = buffer.length - 20
        const reader = new BufferReader(buffer, offset)
        const sha1 = reader.readHex(20)

        return sha1 === await getSha1File(buffer.slice(0, offset))
    }

    async readCache(): Promise<Cache> {
        let offset = 0
        let buffer

        try {
            buffer = await fs.readFile(this.file_)
        } catch (error) {
            return new Cache()
        }

        const header = new CacheHeader
        offset = header.readFromBuffer(buffer, offset)

        if (!(await this.verify(header, buffer))) {
            process.exit(1)
        }

        const entries = []

        for (let i = 0; i < (header.entries as number); i++) {
            const entry = new CacheEntry
            offset = entry.readFromBuffer(buffer, offset)

            entries.push(entry)
        }

        return new Cache(header, entries)
    }

    async writeCache(cache: Cache): Promise<void> {
        if (!this.fd_) return

        const hash = crypto.createHash('sha1')
        const output = fs.createWriteStream(this.lockfile_, { fd: this.fd_ })

        const header = new CacheHeader
        header.signature = CACHE_SIGNATURE
        header.version = CACHE_VERSION
        header.entries = cache.entries.size

        const buffer = Buffer.allocUnsafe(header.bufsize)
        header.writeToBuffer(buffer)

        hash.update(buffer)
        output.write(buffer)

        for (const entry of cache.entries) {
            const buffer = Buffer.allocUnsafe(entry.bufsize)
            entry.writeToBuffer(buffer)

            hash.update(buffer)
            output.write(buffer)
        }

        const sha1 = hash.digest('hex')

        output.write(sha1, 'hex')
        output.end()

        await finished(output)
    }

    async commitIndexFile(): Promise<void> {
        await fs.rename(this.lockfile_, this.file_)
        await IndexFile.releaseIndexFile(this)
    }
}

process.on('exit', () => {
    IndexFile.removeLockFile()
})