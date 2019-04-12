const path = require('path')
const request = require('request')
const browserslistLib = require('browserslist')
const semverCompare = require('semver-compare')

const MOBILE_CONFIG_NAME = 'recommended/mobile'
const MOBILE_CAPABILITIES = require('../recommended/mobile.browserstack.js')

function isWithinVersionRange({ min, max }, version) {
  // if there is minimum and version is lower than minimum
  if (min && semverCompare(min, version) > 0) {
    return false
  }

  // if there is maximum and version is greater than minimum
  if (max && semverCompare(max, version) < 0) {
    return false
  }

  // in any other case it is within range
  return true
}

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
        return []
      }

      const filePath = path.resolve(__dirname, name)
      try {
        return require(filePath)
      } catch (err) {
        console.warn(`Could not read browserslist config specified as "${name}", skipping...`)
        if (debug) {
          console.warn(err)
        }
        return []
      }
    })
    .reduce(
      (memo, config) => memo.concat(config),
      [],
    )

  if (debug) {
    console.log('Resulting browserslist config is as follows:')
    console.log(JSON.stringify(aggregateBrowserslistConfig, null, '  '))
  }

  const browsers = browserslistLib(aggregateBrowserslistConfig).map((c) => {
    const [name, version] = c.split(' ')

    if (version === 'all') {
      // there is no version limits for this browser
      return {
        name,
        version: {}
      }
    }

    const [min, max] = version.split('-')
    return {
      name,
      version: {
        min,
        max,
      },
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
      const capability_version = capability.browser_version || capability.os_version
      if (browsers.find((b) =>
        // capability browser name is in the list of supported browsers
        b.name === capability.browser.toLowerCase() &&
        isWithinVersionRange(b.version, capability_version)
      )) {
        browserStackCapabilities.push(capability)
      }
    })

    if (debug) {
      console.log('Filtered capabilities list received from BrowserStack is as follows:')
      console.log(JSON.stringify(browserStackCapabilities, null, '  '))
      console.log(`Total browsers: ${browserStackCapabilities.length}`)
    }

    resolve(browserStackCapabilities)
  })
})
