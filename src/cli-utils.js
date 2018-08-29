import chalk from 'chalk'

export const log = {
  header: title => {
    // eslint-disable-next-line no-console
    console.log(chalk.bold(`\n---- ${title}\n`))
  },
  info: (text, color) => {
    const textColor = color || 'white'
    // eslint-disable-next-line no-console
    console.log(chalk[textColor](`\n${text}\n`))
  },
  success: text => {
    // eslint-disable-next-line no-console
    console.log(chalk.green(`\n${text}\n`))
  },
  warn: text => {
    // eslint-disable-next-line no-console
    console.log(chalk.red(`\n${text}\n`))
  },
}

export const capitalize = s => {
  return s[0].toUpperCase() + s.slice(1)
}
