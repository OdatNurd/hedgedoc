'use strict'
const fs = require('fs')
const path = require('path')

const config = require('../../config')
const { getImageMimeType } = require('../../utils')
const logger = require('../../logger')

const AWS = require('aws-sdk')
const awsConfig = new AWS.Config(config.s3)
const s3 = new AWS.S3(awsConfig)

exports.uploadImage = function (imagePath, callback) {
  if (!imagePath || typeof imagePath !== 'string') {
    callback(new Error('Image path is missing or wrong'), null)
    return
  }

  if (!callback || typeof callback !== 'function') {
    logger.error('Callback has to be a function')
    return
  }

  fs.readFile(imagePath, function (err, buffer) {
    if (err) {
      callback(new Error(err), null)
      return
    }
    const params = {
      Bucket: config.s3bucket,
      Key: path.join(config.s3folder, path.basename(imagePath)),
      Body: buffer
    }

    const mimeType = getImageMimeType(imagePath)
    if (mimeType) { params.ContentType = mimeType }
    // in proxy mode the bucket objects stay private and the app serves them
    if (config.s3publicFiles && config.s3publicBaseUrl) { params.ACL = 'public-read' }

    logger.debug(`S3 object parameters: ${JSON.stringify(params)}`)
    s3.putObject(params, function (err, data) {
      if (err) {
        callback(new Error(err), null)
        return
      }

      if (config.s3publicBaseUrl) {
        // a public base URL is configured: link straight to the object storage
        const publicBase = config.s3publicBaseUrl.replace(/\/+$/, '')
        callback(null, `${publicBase}/${params.Key}`)
        return
      }

      // no public base URL: serve the object through the app so the bucket
      // can stay private (e.g. Cloudflare R2) and links use our own origin
      callback(null, `${config.serverURL}/uploads/${path.basename(imagePath)}`)
    })
  })
}

// fetch a stored image from the bucket, used by the /uploads proxy route
exports.getImage = function (filename, callback) {
  if (!callback || typeof callback !== 'function') {
    logger.error('Callback has to be a function')
    return
  }
  if (!filename || !/^[\w.-]+$/.test(filename)) {
    callback(new Error('invalid image name'), null)
    return
  }
  const key = path.posix.join(config.s3folder, filename)
  s3.getObject({
    Bucket: config.s3bucket,
    Key: key
  }, function (err, data) {
    if (err) {
      callback(err, null)
      return
    }
    callback(null, {
      body: data.Body,
      contentType: data.ContentType || 'application/octet-stream'
    })
  })
}
