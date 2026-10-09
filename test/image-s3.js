'use strict'

const assert = require('assert')
const path = require('path')
const mock = require('mock-require')

describe('S3 image upload', function () {
  let s3
  let putParams
  let getParams
  let getResponse
  let fakeConfig

  const imagePath = path.resolve(__dirname, '../public/screenshot.png')
  const imageFilename = 'screenshot.png'

  beforeEach(function () {
    putParams = null
    getParams = null
    getResponse = {
      Body: Buffer.from('fake image data'),
      ContentType: 'image/png'
    }
    fakeConfig = {
      debug: false,
      loglevel: 'error',
      imageUploadType: 's3',
      s3: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        region: 'auto',
        endpoint: 'https://accountid.r2.cloudflarestorage.com'
      },
      s3bucket: 'bucket',
      s3folder: 'uploads',
      s3publicFiles: false,
      s3publicBaseUrl: undefined,
      serverURL: 'https://notes.example.com',
      staticCacheTime: 86400000
    }
    mock('aws-sdk', {
      Config: function (config) {
        Object.assign(this, config)
      },
      S3: function () {
        this.putObject = function (params, callback) {
          putParams = params
          callback(null, {})
        }
        this.getObject = function (params, callback) {
          getParams = params
          callback(null, getResponse)
        }
      }
    })
  })

  afterEach(function () {
    mock.stop('aws-sdk')
    mock.stop('../lib/config')
  })

  function loadS3 () {
    mock('../lib/config', fakeConfig)
    s3 = mock.reRequire('../lib/web/imageRouter/s3')
  }

  function uploadImage () {
    return new Promise(function (resolve, reject) {
      s3.uploadImage(imagePath, function (err, url) {
        if (err) reject(err)
        else resolve(url)
      })
    })
  }

  function getImage (filename) {
    return new Promise(function (resolve, reject) {
      s3.getImage(filename, function (err, image) {
        if (err) reject(err)
        else resolve(image)
      })
    })
  }

  it('links images through the app proxy when no public base URL is set', async function () {
    loadS3()
    const url = await uploadImage()
    assert.strictEqual(url, `https://notes.example.com/uploads/${imageFilename}`)
    assert.strictEqual(putParams.Bucket, 'bucket')
    assert.strictEqual(putParams.Key, `uploads/${imageFilename}`)
    assert.strictEqual(putParams.ACL, undefined)
  })

  it('links images at the public base URL when one is configured', async function () {
    fakeConfig.s3publicBaseUrl = 'https://img.example.com/'
    loadS3()
    const url = await uploadImage()
    assert.strictEqual(url, `https://img.example.com/uploads/${imageFilename}`)
  })

  it('sets a public ACL only when both public files and a public base URL are configured', async function () {
    fakeConfig.s3publicFiles = true
    fakeConfig.s3publicBaseUrl = 'https://img.example.com'
    loadS3()
    await uploadImage()
    assert.strictEqual(putParams.ACL, 'public-read')
  })

  it('never sets a public ACL in proxy mode', async function () {
    fakeConfig.s3publicFiles = true
    loadS3()
    await uploadImage()
    assert.strictEqual(putParams.ACL, undefined)
  })

  it('fetches stored images from the configured folder', async function () {
    loadS3()
    const image = await getImage(imageFilename)
    assert.strictEqual(getParams.Bucket, 'bucket')
    assert.strictEqual(getParams.Key, `uploads/${imageFilename}`)
    assert.strictEqual(image.contentType, 'image/png')
    assert.deepStrictEqual(image.body, getResponse.Body)
  })

  it('rejects image names that are not plain filenames', async function () {
    loadS3()
    for (const bad of ['../secret', 'a/b.png', 'a\\b.png', '', null, '..%2Fx']) {
      await assert.rejects(getImage(bad))
    }
    assert.strictEqual(getParams, null)
  })
})
