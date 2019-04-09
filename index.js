const path = require('path')
const fs = require('fs')
const request = require('request')
const browserslistLib = require('browserslist')
const semverCompare = require('semver-compare')

const MOBILE_CONFIG_NAME = 'recommended/mobile'
const MOBILE_CAPABILITIES = require('./recommended/mobile.browserstack.js')

module.exports.getBrowserStackCapabilitiesByConfig = ({
  browserStackUsername,
  browserStackPassword,
  browserslistConfigNames = [],
  debug = false,
}) => new Promise((resolve, reject) => {
  if (!browserStackUsername || !browserStackPassword) {
    return reject(new Error('Both BrowserStack login and password are required'))
  }

  if (browserslistConfigNames.length === 0) {
    return reject(new Error('At list one browserslist config name is required'))
  }

  const browserStackCapabilities = []

  if (browserslistConfigNames.indexOf(MOBILE_CONFIG_NAME) >= 0) {
    MOBILE_CAPABILITIES.forEach(c => browserStackCapabilities.push(c))
  }

  const aggregateBrowserslistConfig = browserslistConfigNames
    .map((name) => {
      if (name === MOBILE_CONFIG_NAME) {
        return ''
      }

      const filePath = path.resolve(__dirname, name)
      try {
        return fs.readFileSync(filePath, 'utf8')
      } catch (err) {
        console.warn(`Could not read browserslist config specified as "${name}", skipping...`)
        if (debug) {
          console.warn(err)
        }
        return ''
      }
    })
    .reduce((memo, config) => memo
      .concat(
        config
          .split('\n')
          .filter((line) => {
            const trimmed = line.trim()
            return !(trimmed === '' || trimmed.startsWith('#'))
          })
      ),
      [],
    )

  if (debug) {
    console.log('Resulting browserslist config is as follows:')
    console.log(JSON.stringify(aggregateBrowserslistConfig, null, '  '))
  }

  const browsers = browserslistLib(aggregateBrowserslistConfig).map((c) => {
    const [name, version] = c.split(' ')
    return {
      name,
      version,
    }
  })

  if (debug) {
    console.log('Browsers derived from config are:')
    console.log(JSON.stringify(browsers, null, '  '))
  }

  request('https://api.browserstack.com/automate/browsers.json', {
    auth: {
      user: browserStackUsername,
      pass: browserStackPassword,
    },
    json: true,
  }, (err, rs, body) => {
    if (err) {
      console.error(err)
      return reject(new Error('Could not fetch available capabilities list from BrowserStack'))
    }

    body.forEach((capability) => {
      if (browsers.find((b) =>
        b.name === capability.browser.toLowerCase() &&
        semverCompare(b.version, capability.browser_version) <= 0
      )) {
        browserStackCapabilities.push(capability)
      }
    })

    if (debug) {
      console.log('Capabilities list received from BrowserStack is as follows:')
      console.log(JSON.stringify(browserStackCapabilities, null, '  '))
    }

    resolve(browserStackCapabilities)
  })
})
