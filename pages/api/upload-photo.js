import { supabase, getRequestContext, TABLES, PHOTO_BUCKET, signPhotoUrls } from '../../lib/supabaseServer'
import formidable from 'formidable'
import fs from 'fs'
import sharp from 'sharp'
import convertHeic from 'heic-convert'

export const config = {
  api: { bodyParser: false }
}

const MAX_DIM = 1600
const JPEG_QUALITY = 82

function isHeic(buffer, filename) {
  // HEIC/HEIF files are ISO-BMFF containers: bytes 4-8 spell "ftyp",
  // followed by a brand like "heic", "heix", "mif1", etc.
  const brand = buffer.slice(8, 12).toString('ascii')
  const looksLikeHeicBrand = ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1'].includes(brand)
  const looksLikeHeicExt = /\.(heic|heif)$/i.test(filename || '')
  return looksLikeHeicBrand || looksLikeHeicExt
}

export default async function handler(req, res) {
  const { userId, canWrite } = await getRequestContext(req)
  if (!userId) return res.status(401).json({ error: 'Not signed in' })
  if (!canWrite) return res.status(403).json({ error: 'Sign in to make changes' })

  if (req.method !== 'POST') return res.status(405).end()

  const form = formidable({ maxFileSize: 15 * 1024 * 1024 }) // 15MB cap on the original
  const [fields, files] = await form.parse(req)

  const itemId = fields.item_id?.[0]
  const file = files.photo?.[0]
  if (!itemId || !file) return res.status(400).json({ error: 'item_id and photo required' })

  const { data: item } = await supabase
    .from(TABLES.items)
    .select('id, photo_url')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single()
  if (!item) return res.status(404).json({ error: 'Item not found' })

  let inputBuffer = fs.readFileSync(file.filepath)

  // Convert HEIC/HEIF (common from iPhone photo library picks) to JPEG first,
  // since sharp's prebuilt binaries don't include HEIF decode support.
  if (isHeic(inputBuffer, file.originalFilename)) {
    try {
      const jpegArrayBuffer = await convertHeic({ buffer: inputBuffer, format: 'JPEG', quality: 0.9 })
      inputBuffer = Buffer.from(jpegArrayBuffer)
    } catch (err) {
      return res.status(400).json({ error: 'Could not read this HEIC photo. Try again or pick a different photo.' })
    }
  }

  // Validate it's actually a real, decodable image (defends against spoofed
  // mimetypes / non-image files), resize it, and strip all metadata
  // (EXIF GPS/geotag, camera info, timestamps) in one pass. sharp drops
  // metadata by default unless .withMetadata() is called, so this is safe.
  let outputBuffer
  try {
    outputBuffer = await sharp(inputBuffer)
      .rotate() // apply EXIF orientation before it gets stripped, so the photo doesn't end up sideways
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  } catch (err) {
    return res.status(400).json({ error: 'That file doesn\'t look like a valid photo.' })
  }

  const path = `${userId}/${itemId}-${Date.now()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, outputBuffer, { contentType: 'image/jpeg', upsert: false })

  if (uploadError) return res.status(400).json({ error: uploadError.message })

  // The bucket is private: store the object path and let the API sign it
  // on read (see signPhotoUrls in lib/supabaseServer).
  const { data: updated, error: updateError } = await supabase
    .from(TABLES.items)
    .update({ photo_url: path })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateError) return res.status(400).json({ error: updateError.message })

  // Best-effort cleanup of the old photo, if any
  if (item.photo_url && item.photo_url !== path) {
    try {
      await supabase.storage.from(PHOTO_BUCKET).remove([item.photo_url])
    } catch {}
  }

  await signPhotoUrls(updated)
  return res.json({ item: updated })
}
