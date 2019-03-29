#!/usr/bin/env node

/* ============================================================
 * node-binance-trader
 * https://github.com/jsappme/node-binance-trader
 * ============================================================
 * Copyright 2018, Herve Fulchiron - herve76@gmail.com
 * Released under the MIT License
 * v0.0.7 - 🐬 delphines 🐬
 * 10/14/2018
 * ============================================================ */

const chalk       = require('chalk')
const ora         = require('ora')
const moment      = require('moment')
const _           = require('lodash')
const numeral     = require('numeral')
const clear       = require('clear')
const figlet      = require('figlet')
const Configstore = require('configstore')
const binance     = require('binance-api-node').default
const inquirer    = require("inquirer")
const setTitle    = require('node-bash-title')
const BigNumber   = require('bignumber.js');
const nodemailer  = require('nodemailer')

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').load();
}

//////////////////////////////////////////////////////////////////////////////////
// https://www.binance.com/restapipub.html
// REPLACE xxx with your own API key key and secret.
//
console.log(process.env.API_KEY)
console.log(process.env.API_KEY)
const APIKEY = process.env.API_KEY
const APISECRET = process.env.API_SECRET
//////////////////////////////////////////////////////////////////////////////////

let pnl = 0
let step = 0
let trade_count = 0
let order_id = 0
let buy_price = 0.00
let bid_price = 0.00
let ask_price = 0.00
let switch_price  = 0.00
let stop_price = 0.00
let loss_price = 0.00
let sell_price = 0.00
let buy_amount = 0.00
let stepSize = 0
let tickSize = 8
let tot_cancel = 0
let pair = ""
let buying_method = ""
let selling_method = ""
let init_buy_filled = false

var my_coins = []
var is_email_enable = false

// subject
// symbol + " SELL :: " + strat.name + " :: "
//     + " pnl:%" + numeral(100.00*((parseFloat(close)/parseFloat(tracked_pairs[tracked_index].price))-1)).format("0.000") 
//     + " tpnl:%" + numeral(_.sumBy(total_pnl[strat.name], 'pnl')).format("0.000") 
//     + " ::  A:" + numeral(depth_asks[symbol]).format("0.00") 
//     + " B:" + numeral(depth_bids[symbol]).format("0.00") 
//     + " C:" + close 
//     + " D:%" + numeral(depth_diff[symbol]).format("0.000")

// text
// "https://www.binance.com/tradeDetail.html?symbol=" + symbol.slice(0, -3) + "_BTC \n"
//     + "  ------------------------------------------ \n"
//     + tracked_data[symbol][strat.name].map(item => JSON.stringify(item)+"\n") + "\n"

const gmail_address = process.env.G_EMAIL
const gmail_password = process.env.G_PSWD
const gmailEmail = encodeURIComponent(gmail_address);
const gmailPassword = encodeURIComponent(gmail_password);
const mailTransport = nodemailer.createTransport(`smtps://${gmailEmail}:${gmailPassword}@smtp.gmail.com`);
const mailOptions = {
  from: '"NBT Bot" ' + gmail_address,
  to: gmail_address,
  subject: null, 
  text: null
}
//////////////////////////////////////////////////////////////////////////////////

// Binance API initialization //
const client = binance({apiKey: APIKEY, apiSecret: APISECRET, useServerTime: true})

const conf = new Configstore('nbt')
let pair_currency = ''
let coin_info = ''
let base_currency = conf.get('nbt.base_currency')?conf.get('nbt.base_currency'):"USDT"
let budget = conf.get('nbt.budget')?parseFloat(conf.get('nbt.budget')):1.00
let fixed_buy_price = conf.get('nbt.fixed_buy_price')?parseFloat(conf.get('nbt.fixed_buy_price')):0.00
let currency_to_buy = conf.get('nbt.currency_to_buy')?conf.get('nbt.currency_to_buy'):"BTC"
let profit_pourcent = conf.get('nbt.profit_pourcent')?conf.get('nbt.profit_pourcent'):0.80
let loss_pourcent = conf.get('nbt.loss_pourcent')?conf.get('nbt.loss_pourcent'):0.40
let trailing_pourcent = conf.get('nbt.trailing_pourcent')?conf.get('nbt.trailing_pourcent'):0.40

clear()

console.log(chalk.yellow(figlet.textSync('_B_T_', { horizontalLayout: 'fitted' })))
console.log(' ')
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
// console.log(" 🐬 ".padEnd(10) + chalk.bold.underline.cyan('Node Binance Trader') + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
console.log(' ')
console.log(chalk.yellow('  ⚠️  USE THIS APP AT YOUR OWN RISK ⚠️'))
console.log(' ')

var buy_info_request = [
  {
    type: 'input',
    name: 'base_currency',
    message: chalk.cyan('What base currency would you use for the trade? (USDT, BTC, BNB or ETH)'),
    default: base_currency,
    validate: function(value) {
      var valid = ((value.toUpperCase()==='BTC')||(value.toUpperCase()==='USDT')||(value.toUpperCase()==='ETH')||(value.toUpperCase()==='BNB'))
      return valid || 'Currency not valid, please chose between USDT, BTC, BNB, ETH'
    },
  },
  {
    type: 'input',
    name: 'budget',
    default: budget,
    message: chalk.cyan('What is your budget for this trade? (in base currency)(total value. > 15 USD.)'),
    validate: function(value) {
      var valid = !isNaN(parseFloat(value)) && (value>0)
      return valid || 'Please enter a number superior than 0'
    },
    filter: Number
  },
  {
    type: 'input',
    name: 'currency_to_buy',
    message: chalk.cyan('What currency would you like to buy?'),
    default: currency_to_buy,
  },
]


const report = ora(chalk.grey('Starting the trade...'))

ask_pair_budget = () => {
  inquirer.prompt(buy_info_request).then(answers => {
    pair = (answers.currency_to_buy + answers.base_currency).toUpperCase()
    conf.set('nbt.base_currency', (answers.base_currency).toUpperCase())
    conf.set('nbt.budget', answers.budget)
    conf.set('nbt.currency_to_buy', (answers.currency_to_buy).toUpperCase())
    base_currency = (answers.base_currency).toUpperCase()
    currency_to_buy = (answers.currency_to_buy).toUpperCase()
    budget = parseFloat(answers.budget)
    buy_info_request[0].default  = base_currency
    buy_info_request[1].default  = budget
    buy_info_request[2].default  = currency_to_buy
    // FIND OUT IF PAIR EXISTS AND THE PAIR QUOTE INFO:
    client.exchangeInfo().then(results => {
      // CHECK IF PAIR IS UNKNOWN:
      if (_.filter(results.symbols, {symbol: pair}).length > 0) {
        setTitle('🐬 ' + pair + ' 🐬 ')
        client.book({ symbol: pair }).then(results => {
          console.log( chalk.grey(moment().format('h:mm:ss').padStart(8))
            + chalk.yellow(pair.padStart(10))
            + chalk.grey(" CURRENT 1ST BID PRICE: " + bid_price )
          )
          ask_menu()
        })
      }
      else {
        console.log(chalk.magenta("SORRY THE PAIR ") + chalk.green(pair) + chalk.magenta(" IS UNKNOWN BY BINANCE. Please try another one."))
        ask_menu()
      }
    })
  })
}

see_order = () => {
  client.allOrders().then(orders => {
    console.log(orders)
  })
}

var info_request = [
  {
    type: 'input',
    name: 'pair_currency',
    message: chalk.cyan('What urrency would you use for make pair? (USDT, BTC, BNB or ETH)'),
    default: base_currency,
    validate: function(value) {
      var valid = ((value.toUpperCase()==='BTC')||(value.toUpperCase()==='USDT')||(value.toUpperCase()==='ETH')||(value.toUpperCase()==='BNB'))
      return valid || 'Currency not valid, please chose between USDT, BTC, BNB, ETH'
    }
  },
  {
    type: 'input',
    name: 'coin_info',
    message: chalk.cyan('What currency would you like to get information ?'),
    default: currency_to_buy
  }
]

see_info_coin = () => {
  inquirer.prompt(info_request).then(answers => {
    pair = (answers.coin_info + answers.pair_currency).toUpperCase()
    conf.set('nbt.base_currency', (answers.pair_currency).toUpperCase())
    conf.set('nbt.currency_to_buy', (answers.coin_info).toUpperCase())
    base_currency = (answers.pair_currency).toUpperCase()
    currency_to_buy = (answers.coin_info).toUpperCase()
    info_request[0].default  = pair_currency
    info_request[1].default  = coin_info
    buy_info_request[0].default  = pair_currency
    buy_info_request[2].default  = coin_info
    // FIND OUT IF PAIR EXISTS AND THE PAIR QUOTE INFO:
    client.book({ symbol: pair }).then(results => {
      // SO WE CAN TRY TO BUY AT THE 1ST BID PRICE + %0.02:
      bid_price = parseFloat(results.bids[0].price)
      ask_price = parseFloat(results.asks[0].price)
      console.log( chalk.grey(moment().format('h:mm:ss').padStart(8))
        + chalk.yellow(pair.padStart(10))
        + chalk.grey(" CURRENT 1ST BID PRICE: " + bid_price ))
      fixed_buy_price_input[0].default = restapipubults.bids[0].price
      ask_buy_sell_options()
    })
  })
}

see_balance = () => {
  console.log(' ')
  console.log(
    chalk.magenta.bold('Pair'.padEnd(10) + ' '.padEnd(10) + 'Free'.padEnd(10) + ' '.padEnd(10) + 'Loked'.padEnd(10)) + ' '.padEnd(10)
    + chalk.magenta.bold(moment().format('h:mm:ss'))
  )

  var all_prices_crypto = []
  var balance_in_btc = 0
  var valueBTC = 0
  client.prices().then((ticker) => {
    var keyCrypto = Object.keys(ticker)
    var valueCrypto = Object.values(ticker)
    valueBTC = parseFloat(ticker.BTCUSDT)
    my_coins.forEach(function (coin) {
      // console.log(keyCrypto.indexOf(coin.asset + 'BTC'))
      var index = keyCrypto.indexOf(coin.asset == 'BTC' ? 'BTCUSDT' : coin.asset + 'BTC')
      if (index > 0 ) {
        var value = new BigNumber(valueCrypto[index])
        var coinValue = (new BigNumber(coin.locked).plus(parseFloat(coin.free)))
        balance_in_btc += coin.asset == 'BTC' ? parseFloat(coinValue.toFormat(8)) : parseFloat(value.times(coinValue).toFormat(8))
        console.log(balance_in_btc)
      }

      console.log(chalk.cyan(coin.asset.padEnd(10) + ' '.padEnd(10) + coin.free.padEnd(10) + ' '.padEnd(10) + coin.locked.padEnd(10)))
      console.log(' ')
    })
  }).then(() => {
    console.log(
      chalk.magenta.bold('BTC ' + balance_in_btc.toString().padEnd(10) + ' | USDT $ ' + parseFloat(valueBTC * parseFloat(balance_in_btc)).toFixed(2)).padEnd(10) + ' '.padEnd(20) 
      + chalk.magenta.bold(moment().format('h:mm:ss'))
    )
    ask_menu()
  });
}

var buy_sell_options = [
  {
    type: 'list',
    name: 'buy_option',
    message: chalk.cyan('How would you like to buy:'),
    choices: ['Buy at Market Price', 'Set a Buy Order just above Bid Price', 'Set a Buy Order at a Fixed Buy Price'],
  },
  {
    type: 'list',
    name: 'sell_option',
    message: chalk.cyan('How would you like to sell:'),
    choices: ['Set a Trailing Stop Loss', 'Set Stop Loss and Profit Percentages'],
  },
]

ask_buy_sell_options = () => {
  inquirer.prompt(buy_sell_options).then(answers => {
    if (answers.buy_option.includes("Market")) {
      // MARKET PRICE BUY //
      buying_method = "Market"
      if (answers.sell_option.includes("Trailing")) {
        selling_method = "Trailing"
        ask_trailing_percent()
      }
      else {
        selling_method = "Profit"
        ask_loss_profit_percents()
      }
    }
    if (answers.buy_option.includes("Bid")) {
      // BID PRICE BUY //
      buying_method = "Bid"
      if (answers.sell_option.includes("Trailing")) {
        selling_method = "Trailing"
        ask_trailing_percent()
      }
      else {
        selling_method = "Profit"
        ask_loss_profit_percents()
      }
    }
    if (answers.buy_option.includes("Fixed")) {
      // FIXED PRICE BUY //
      buying_method = "Fixed"
      ask_fixed_buy_price(answers.sell_option)
    }
  })
}

var fixed_buy_price_input = [
  {
    type: 'input',
    name: 'fixed_buy_price',
    default: fixed_buy_price,
    message: chalk.cyan('What is Fixed Buy Price? (in base currency)'),
    validate: function(value) {
      var valid = !isNaN(parseFloat(value)) && (value>0)
      return valid || 'Please enter a number superior than 0'
    },
    filter: Number
  }
]

ask_fixed_buy_price = (sell_option) => {
  console.log(" ")
  inquirer.prompt(fixed_buy_price_input).then(answers => {
    conf.set('nbt.fixed_buy_price', answers.fixed_buy_price)
    fixed_buy_price = parseFloat(answers.fixed_buy_price)
    fixed_buy_price_input[0].default = fixed_buy_price
    console.log(chalk.grey("The bot will set a buy order at " + fixed_buy_price))
    if (sell_option.includes("Trailing")) {
      selling_method = "Trailing"
      ask_trailing_percent()
    }
    else {
      selling_method = "Profit"
      ask_loss_profit_percents()
    }
  })
}

var loss_profit_inputs = [
  {
    type: 'input',
    name: 'loss_pourcent',
    default: loss_pourcent,
    message: chalk.hex('#FF6347')('Enter the stop loss percentage:'),
    validate: function(value) {
      var valid = !isNaN(parseFloat(value)) && (value>0.10) && (value<100.00)
      return valid || 'Please enter a number between 0.10 and 99.99'
    },
    filter: Number
  },
  {
    type: 'input',
    name: 'profit_pourcent',
    default: profit_pourcent,
    message: chalk.hex('#3CB371')('Enter the profit percentage:'),
    validate: function(value) {
      var valid = !isNaN(parseFloat(value)) && (value>0.10) && (value<100.00)
      return valid || 'Please enter a number between 0.10 and 99.99'
    },
    filter: Number
  },
  {
    type: 'confirm',
    name: 'confirm',
    message: chalk.cyan('Start the trade now?'),
    default: true
  },
]

ask_loss_profit_percents = () => {
  console.log(" ")
  inquirer.prompt(loss_profit_inputs).then(answers => {
    if (answers.confirm) {
      conf.set('nbt.profit_pourcent', answers.profit_pourcent)
      conf.set('nbt.loss_pourcent', answers.loss_pourcent)
      profit_pourcent = parseFloat(answers.profit_pourcent)
      loss_pourcent = parseFloat(answers.loss_pourcent)
      loss_profit_inputs[0].default = loss_pourcent
      loss_profit_inputs[1].default = profit_pourcent
      start_trading()
    }
    else {
      ask_pair_budget()
    }
  })
}


var trailing_loss_input = [
  {
    type: 'input',
    name: 'trailing_pourcent',
    default: trailing_pourcent,
    message: chalk.hex('#FF6347')('Enter the Trailing Loss Percentage:'),
    validate: function(value) {
      var valid = !isNaN(parseFloat(value)) && (value>0.10) && (value<100.00)
      return valid || 'Please enter a number between 0.10 and 99.99'
    },
    filter: Number
  },
  {
    type: 'confirm',
    name: 'confirm',
    message: chalk.cyan('Start the trade now?'),
    default: true
  },
]

ask_trailing_percent = () => {
  console.log(" ")
  inquirer.prompt(trailing_loss_input).then(answers => {
    if (answers.confirm) {
      conf.set('nbt.trailing_pourcent', answers.trailing_pourcent)
      trailing_pourcent = parseFloat(answers.trailing_pourcent)
      trailing_loss_input[0].default = trailing_pourcent
      start_trading()
    }
    else {
      ask_pair_budget()
    }
  })
}


start_trading = () => {
  var precision = stepSize.toString().split('.')[1].length || 0
  if (buying_method === "Fixed") {
    buy_amount = (( ((budget / fixed_buy_price) / parseFloat(stepSize)) | 0 ) * parseFloat(stepSize)).toFixed(precision)
    buy_price = parseFloat(fixed_buy_price)
    console.log(chalk.grey("BUYING " + buy_amount + " OF " + currency_to_buy + " AT FIXED PRICE ") + chalk.green(buy_price.toFixed(tickSize)))
    client.order({
      symbol: pair,
      side: 'BUY',
      quantity: buy_amount,
      price: buy_price.toFixed(tickSize),
      recvWindow: 1000000,
    })
    .then( (order_result) => {
      order_id = order_result.orderId
      auto_trade()
    })
    .catch((error) => {
      //console.error(JSON.stringify(error))
      report.fail(error)
      ask_pair_budget()
    })
  }
  else if (buying_method === "Bid") {
    buy_amount = (( ((parseFloat(budget) / (parseFloat(bid_price) * 1.0002)) / parseFloat(stepSize)) | 0 ) * parseFloat(stepSize)).toFixed(precision)
    buy_price = parseFloat(bid_price) * 1.0002
    console.log(chalk.grey("BUYING " + buy_amount + " OF " + currency_to_buy + " AT JUST ABOVE 1ST BID PRICE ") + chalk.green(buy_price.toFixed(tickSize)))
    client.order({
      symbol: pair,
      side: 'BUY',
      quantity: buy_amount,
      price: buy_price.toFixed(tickSize),
      recvWindow: 1000000,
    })
    .then( (order_result) => {
      order_id = order_result.orderId
      auto_trade()
    })
    .catch((error) => {
      //console.error(JSON.stringify(error))
      report.fail(error)
      ask_pair_budget()
    })
  }
  else if (buying_method === "Market") {
    buy_amount = (( ((parseFloat(budget) / (parseFloat(ask_price) * 1.0002)) / parseFloat(stepSize)) | 0 ) * parseFloat(stepSize)).toFixed(precision)
    buy_price = parseFloat(ask_price)
    console.log(chalk.green("BUYING " + buy_amount + " OF " + currency_to_buy + " AT MARKET PRICE" ))
    client.order({
      symbol: pair,
      side: 'BUY',
      quantity: buy_amount,
      type: 'MARKET',
      recvWindow: 1000000,
    })
    .then( (order_result) => {
      order_id = order_result.orderId
      auto_trade()
    })
    .catch((error) => {
      //console.error(JSON.stringify(error))
      report.fail(error)
      ask_pair_budget()
    })
  }
}

auto_trade = () => {
  step = 1
  report.text = ""
  report.start()
  // LISTEN TO KEYBOARD PRSEED KEYS
  process.stdin.resume()
  process.stdin.setRawMode(true)
  console.log(chalk.grey(" ⚠️  Press [ CTRL + c ] or q to cancel the trade and sell everything at market price. ⚠️ "))
  console.log(" ")
  const curr_trade = trade_count
  const clean_trades = client.ws.trades([pair], trade => {

    if (curr_trade !== trade_count) clean_trades()
    report.text = add_status_to_trade_report(trade, "")

    // CHECK IF INITIAL BUY ORDER IS EXECUTED
    if ( order_id && (step === 1) ) {
      step = 99
      checkBuyOrderStatus()
    }

    // SWITCH PRICE REACHED SETTING UP SELL FOR PROFIT ORDER
    if ( (selling_method === "Profit") && order_id && (step === 3) && (trade.price > switch_price) ) {
      step = 99
      console.log(chalk.grey(" CANCEL STOP LOSS AND GO FOR PROFIT "))
      client.cancelOrder({
        symbol: pair,
        orderId: order_id,
        recvWindow: 1000000,
      })
      .then(() => {
        client.order({
          symbol: pair,
          side: 'SELL',
          quantity: buy_amount,
          price: sell_price,
          recvWindow: 1000000,
        })
        .then((order) => {
          step = 5
          order_id = order.orderId
          var log_report = chalk.grey(" SELL ORDER READY ")
          console.log(log_report)
        })
        .catch((error) => {
          var log_report = chalk.magenta(" ERROR #555 ")
          console.error(log_report + error)
        })
      })
      .catch((error) => {
        console.log(" ERROR #547 ")
        console.error(error)
      })
    }

    // INCREASE THE TRAILING STOP LOSS PRICE
    if ( (selling_method === "Trailing") && order_id && (step === 3) && (trade.price > switch_price) ) {
      step = 99
      tot_cancel = tot_cancel + 1
      console.log(chalk.grey(" CANCEL CURRENT STOP LOSS "))
      client.cancelOrder({
        symbol: pair,
        orderId: order_id,
        recvWindow: 1000000,
      })
      .then(() => {
        stop_price = (parseFloat(stop_price) + (parseFloat(stop_price) * trailing_pourcent / 100.00)).toFixed(tickSize)
        loss_price = (parseFloat(stop_price) - (parseFloat(stop_price) * 0.001)).toFixed(tickSize)
        set_stop_loss_order()
        switch_price = (parseFloat(switch_price) + (parseFloat(switch_price) * trailing_pourcent / 100.00)).toFixed(tickSize)
        console.log(chalk.grey(" NEW TRAILING STOP LOSS SET @ " + stop_price))
        step = 3
      })
      .catch((error) => {
        console.log(" ERROR #547 ")
        console.error(error)
      })
    }

    // PRICE BELLOW BUY PRICE SETTING UP STOP LOSS ORDER
    if ( (selling_method==='Profit') && order_id && (step === 5) && (trade.price < buy_price) ) {
      step = 99
      console.log(chalk.grey(" CANCEL PROFIT SETTING UP STOP LOSS "))
      tot_cancel = tot_cancel + 1
      client.cancelOrder({
        symbol: pair,
        orderId: order_id,
        recvWindow: 1000000,
      })
      .then(() => {
        set_stop_loss_order()
      })
      .catch((error) => {
        pnl = 100.00*(buy_price - trade.price)/buy_price
        var log_report = chalk.magenta(" LOSS PRICE REACHED THE BOT SHOULD HAVE SOLD EVERYTHING #454 ")
        report.fail(add_status_to_trade_report(trade, log_report))
        reset_trade()
        setTimeout( () => { ask_pair_budget(), 1000 } )
      })
    }

    // CURRENT PRICE REACHED SELL PRICE
    if ( (selling_method === "Profit") && order_id && (step === 5) && (trade.price >= sell_price) ) {
      step = 99
      client.getOrder({
        symbol: pair,
        orderId: order_id,
        recvWindow: 1000000,
      })
      .then( (order_result) => {
        if ( parseFloat(order_result.executedQty) < parseFloat(order_result.origQty) ) {
          var log_report = chalk.grey(" PROFIT PRICE REACHED BUT NOT ALL EXECUTED " + order_result.executedQty )
          report.text = add_status_to_trade_report(trade, log_report)
          step = 5
        }
        else {
          clean_trades()
          pnl = 100.00*(trade.price - buy_price)/buy_price
          var log_report = chalk.greenBright(" 🐬 !!! WE HAVE A WINNER !!! 🐬 ")
          report.text = add_status_to_trade_report(trade, log_report)
          reset_trade()
          report.succeed()
          setTimeout( () => { ask_pair_budget(), 1000 } )
        }
      })
      .catch((error) => {
        console.error(" ERROR 8 " + error)
      })
    }

    // CURRENT PRICE REACHED STOP PRICE
    if ( order_id && (step === 3) && (trade.price <= stop_price) ) {
      step = 99
      client.getOrder({
        symbol: pair,
        orderId: order_id,
        recvWindow: 1000000,
      })
      .then( (order_result) => {
        if ( parseFloat(order_result.executedQty) < parseFloat(order_result.origQty) ) {
          var log_report = chalk.grey(" STOP PRICE REACHED BUT NOT ALL EXECUTED " + order_result.executedQty )
          report.text = add_status_to_trade_report(trade, log_report)
          step = 5
        }
        else {
          clean_trades()
          pnl = 100.00*(buy_price - trade.price)/buy_price
          var log_report = chalk.magenta(" STOP LOSS ALL EXECUTED")
          report.text = add_status_to_trade_report(trade, log_report)
          reset_trade()
          report.succeed()
          setTimeout( () => { ask_pair_budget(), 1400 } )
        }
      })
      .catch((error) => {
        console.error(" API ERROR #9 " + error)
        clean_trades()
        pnl = 100.00*(buy_price - trade.price)/buy_price
        var log_report = chalk.magenta(" TRADE STOPPED ")
        report.text = add_status_to_trade_report(trade, log_report)
        reset_trade()
        report.fail()
        setTimeout( () => { ask_pair_budget(), 1400 } )
      })
    }
  })
}

sell_at_market_price = () => {
  console.log(chalk.keyword('orange')(" SELLING AT MARKET PRICE "))
  client.order({
    symbol: pair,
    side: 'SELL',
    type: 'MARKET',
    quantity: buy_amount,
    recvWindow: 1000000,
  })
  .then( order => {
    reset_trade()
    report.succeed( chalk.magenta(" THE BOT SOLD AT MARKET PRICE #777 ") )
    setTimeout( () => { ask_pair_budget(), 2500 } )
  })
  .catch( error => {
    report.fail( " ERROR #7771 " + buy_amount + " :: " + error )
    reset_trade()
  })
}

checkBuyOrderStatus = () => {
  client.getOrder({ symbol: pair, orderId: order_id, recvWindow: 1000000, })
  .then( order => {
    if (order.status === "FILLED") {
      init_buy_filled = true
      client.accountInfo({recvWindow: 1000000}).then(info => {
        info.balances.forEach(function (value, index) {
          var pairSearched = value.asset + base_currency
          if (pairSearched == pair) {
            console.log(chalk.white(" QTD BOUGHT #FREE ") + chalk.gray.bold(value.free) + chalk.white(" QTD BOUGHT #LOCKED ") + chalk.gray.bold(value.locked))
            // buy_amount = parseFloat(value.free)
          }
        })
        // buy_amount = parseFloat(order.executedQty)
        console.log(chalk.white(" INITAL BUY ORDER FULLY EXECUTED "))
        client.myTrades({ symbol: pair, limit: 1, recvWindow: 1000000 }).then( mytrade => {
          buy_price = parseFloat(mytrade[0].price)
          console.log(chalk.gray(" FINAL BUY PRICE @ ") + chalk.cyan(buy_price))
          if (selling_method==="Trailing") {
            stop_price = (buy_price - (buy_price * trailing_pourcent / 100.00)).toFixed(tickSize)
            loss_price = (stop_price - (stop_price * 0.001)).toFixed(tickSize)
            set_stop_loss_order()
            switch_price = (buy_price + (buy_price * trailing_pourcent / 100.00)).toFixed(tickSize)
          }
          else {
            stop_price = (buy_price - (buy_price * loss_pourcent / 100.00)).toFixed(tickSize)
            loss_price = (stop_price - (stop_price * 0.001)).toFixed(tickSize)
            set_stop_loss_order()
            switch_price = (buy_price + (buy_price * profit_pourcent / 200.00)).toFixed(tickSize)
            sell_price = (buy_price + (buy_price * profit_pourcent / 100.00)).toFixed(tickSize)
          }
        })
      })
    }
    else {
      console.log(chalk.gray(" BUY ORDER NOT YET FULLY EXECUTED "))
      init_buy_filled = false
      step = 1
    }
  })
}

set_stop_loss_order = () => {
  client.order({
    symbol: pair,
    side: 'SELL',
    type: 'STOP_LOSS_LIMIT',
    stopPrice: stop_price,
    quantity: buy_amount,
    price: loss_price,
    recvWindow: 1000000,
  })
  .then((order) => {
    order_id = order.orderId
    var log_report = chalk.grey(" STOP LOSS READY (" + tot_cancel + ") @ ") + chalk.cyan(stop_price)
    console.log(log_report)
    step = 3
  })
  .catch((error) => {
    console.error(" ERRROR #1233 STOP PRICE (" + stop_price + ") " + error )
    if (String(error).includes("MIN_NOTIONAL")) {
      console.error("⚠️  PLEASE MAKE SURE YOUR BUDGET VALUE IS SUPERIOR THAN 15 USD ⚠️")
    }
    sell_at_market_price()
  })
}

add_status_to_trade_report = (trade, status) => {
  if (init_buy_filled) {
    var pnl = 100.00*(parseFloat(trade.price)-parseFloat(buy_price))/parseFloat(buy_price)
  }
  else {
    var pnl = 0.00
  }
  return chalk.grey(moment().format('h:mm:ss').padStart(8))
    + chalk.yellow(trade.symbol.padStart(10))
    + (!trade.maker?chalk.green((chalk.grey("qty:")+numeral(trade.quantity).format("0.000")).padStart(30)):chalk.red((chalk.grey("qty:")+numeral(trade.quantity).format("0.000")).padStart(30)))
    + chalk.grey(" @ ") + chalk.cyan(trade.price).padEnd(24)
    + ((pnl >= 0)?chalk.green((chalk.grey("pnl:")+numeral(pnl).format("0.000")).padStart(20)):chalk.red((chalk.grey("pnl:")+numeral(pnl).format("0.000")).padStart(20)))
    + chalk.white(status)
}

reset_trade = () => {
  step = 0
  trade_count = trade_count + 1
  order_id = 0
  buy_price  = 0.00
  stop_price = 0.00
  loss_price = 0.00
  sell_price = 0.00
  tot_cancel = 0
  init_buy_filled = false
}

////////////////////////////////////////////////////////////////////
// LISTEN TO KEYBOARD AND CANCEL THE TRADE IF (CRTL + C) OR Q PRESSED
process.stdin.setEncoding( 'utf8' )
process.stdin.on('keypress', ( key ) => {
  if ( (key === '\u0003') || (key === 'q') ) {
    if (order_id) {
      trade_count = trade_count + 1
      console.log(" --- STOPPING THE TRADE ---  ")
      client.cancelOrder({
        symbol: pair,
        orderId: order_id,
        recvWindow: 1000000,
      })
      .then( (order) => {
        console.log(" CURRENT ORDER CANCELED ")
        client.getOrder({
          symbol: pair,
          orderId: order_id,
          recvWindow: 1000000,
        })
        .then( (order_result) => {
          if (order_result.status === "FILLED") {
            console.log("PREV ORDER FILLED")
            sell_at_market_price()
          }
          else if (order_result.status === "PARTIALLY_FILLED") {
            console.log("PREV ORDER PARTIALLY_FILLED")
            if (order_result.side === "BUY") {
              buy_amount = parseFloat(order_result.executedQty)
              sell_at_market_price()
            }
            else {
              buy_amount = parseFloat(order_result.origQty) - parseFloat(order_result.executedQty)
              sell_at_market_price()
            }
          }
          else if (order_result.status === "CANCELED") {
            if (order_result.side === "SELL") {
              sell_at_market_price()
            }
            else {
              sell_at_market_price()
              reset_trade()
              report.succeed( chalk.magenta(" THE BOT STOPPED THE TRADE #3365 ") )
              setTimeout( () => { ask_pair_budget(), 2500 } )
            }
          }
        })
        .catch((error) => {
          console.error(" GET FINAL ORDER ERROR : " + error)
          sell_at_market_price()
        })
      })
      .catch((error) => {
        console.error(" FINAL CANCEL ERROR : " + error)
        sell_at_market_price()
      })
    }
  }
})
////////////////////////////////////////////////////////////////////

var options_menu = [
  new inquirer.Separator(),
  {
    name: 'See your balances',
    value: {
      name: 'see_balance',
      method: see_balance
    }
  },
  {
    name: 'See your orders',
    value: {
      name: 'see_order',
      method: see_order
    }
  },
  {
    name: 'Create trade',
    value: {
      name: 'create_trade',
      method: ask_pair_budget
    }
  },
  {
    name:'See info about your trades',
    value: {
      name: 'see_trades',
      method: () => {
        console.log('not implement')
      }
    }
  },
  {
    name:'Toggle status email',
    value: {
      name: 'toggle_email',
      method: () => {
        is_email_enable = !is_email_enable
        clear()
        ask_menu()
      }
    }
  },
  {
    name:'See info about a specific coin',
    value: {
      name: 'see_info_coin',
      method: see_info_coin
    }
  }
]

var menu_request = [
  {
    type: 'list',
    name: 'menu_option',
    message: chalk.cyan('What you would like to Do ?'),
    choices: options_menu,
  },
]

ask_menu = () => {

  my_coins = []
  client.accountInfo().then(results => {
    results.balances.forEach(function (coin) {
      if((parseFloat(coin.free) > 0) || (parseFloat(coin.locked) > 0)) {
        my_coins.push(coin)
      }
    })
  }).then(() => {
    console.log(chalk.cyan('Is email enabled ? ') +  (is_email_enable ?  chalk.green(' True ') : chalk.red(' False ')))
    console.log(' ')
    inquirer.prompt(menu_request).then(answers => {
      for(var i = 0; i < options_menu.length; i++) {
        if (options_menu[i].value  && (options_menu[i].value.name == answers.menu_option.name)) {
          options_menu[i].value.method()
        }
      }
    })
  })
}

const run = async () => {
  ask_menu()
}

run()
