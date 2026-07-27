import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const directory = fileURLToPath(new URL(".", import.meta.url))
const output = (name) => join(directory, name)

async function image(name, width, height, options = {}) {
  const source = sharp({
    create: {
      width,
      height,
      channels: options.alpha ? 4 : 3,
      background: options.alpha ? { r: 38, g: 121, b: 178, alpha: 0.5 } : { r: 38, g: 121, b: 178 },
    },
  })
  let pipeline = source
  if (options.orientation) pipeline = pipeline.withMetadata({ orientation: options.orientation })
  if (options.format === "png") pipeline = pipeline.png()
  else if (options.format === "webp") pipeline = pipeline.webp()
  else pipeline = pipeline.jpeg({ quality: 82 })
  await pipeline.toFile(output(name))
}

await mkdir(directory, { recursive: true })
await image("portrait-orientation-6.jpg", 600, 900, { orientation: 6 })
await image("landscape-orientation-1.jpg", 900, 600, { orientation: 1 })
await image("low-resolution.jpg", 319, 480)
await image("decoded-120mp.jpg", 12000, 10000)
await image("transparent.png", 800, 600, { format: "png", alpha: true })
await image("sample.webp", 800, 600, { format: "webp" })
await image("duplicate-a.jpg", 800, 600)
await writeFile(output("duplicate-b.jpg"), await readFile(output("duplicate-a.jpg")))
await writeFile(output("corrupt-image.jpg"), Buffer.from("not-an-image"))
await writeFile(output("extension-mime-mismatch.png"), await readFile(output("landscape-orientation-1.jpg")))
await writeFile(output("synthetic.heic"), Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(32)]))

console.log("Generated synthetic FotoMax image fixtures")
