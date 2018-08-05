import { EGG_DIR } from './config'
import { IndexFile } from './index'

export default async function main(): Promise<string> {
    const indexFile = await new IndexFile(`${EGG_DIR}/index`)
    const cache = await indexFile.readCache()

    return await cache.writeTree()
}