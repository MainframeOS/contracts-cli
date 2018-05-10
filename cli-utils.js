const chalk = require('chalk')

const log = {
  header: (title) => {
    console.log(chalk.bold(`\n---- ${title}\n`))
  },
  info: (text, color) => {
    const textColor = color || 'white'
    console.log(chalk[textColor](`\n${text}\n`))
  },
  success: (text) => {
    console.log(chalk.green(`\n${text}\n`))
  },
  warn: (text) => {
    console.log(chalk.red(`\n${text}\n`))
  },
}

const capitalize = (s) => {
  return s[0].toUpperCase() + s.slice(1)
}

module.exports = { log, capitalize }
