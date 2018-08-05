import fs from 'fs-extra'
import { EGG_DIR } from './config'

function tohex(num: number) {
    return `00${(num >> 0).toString(16)}`.slice(-2)
}

export default async function main() {
    await fs.mkdir(`${EGG_DIR}`)
    await fs.mkdir(`${EGG_DIR}/refs`)
    await fs.mkdir(`${EGG_DIR}/refs/heads`)
    await fs.mkdir(`${EGG_DIR}/refs/tags`)
    await fs.symlink('refs/heads/master', `${EGG_DIR}/HEAD`)

    await fs.mkdir(`${EGG_DIR}/objects`)

    for (let i = 0; i < 256; i++) {
        await fs.mkdir(`${EGG_DIR}/objects/${tohex(i)}`)
    }

    await fs.mkdir(`${EGG_DIR}/objects/pack`)
}