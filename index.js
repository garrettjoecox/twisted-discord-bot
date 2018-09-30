
const discord = require('discord.js');
const config = require('./config');
const bot = new discord.Client();
const json = require('./json');
const parse = require('shell-quote').parse;
const rightpad = require('right-pad');
const charLengths = require('./charlengths');
const _ = require('lodash');
const consoleChatChannel = '486984821600550933';
const chatBot = '487659509238595592';

const commands = {
  portalhelp,
  list,
  get,
  set,
  remove,
  newpin,
  syncpin,
};

bot.on('message', async (message) => {
  // Ignore all other bots
  if (message.author.bot && message.author.id !== chatBot) return;
  // Ignore console-chat channel
  if (message.channel.id === consoleChatChannel) return;
  const match = message.content.match(/!loc(.*)/);
  if (!match) return;

  const args = parse(match[1]);
  if (!args.length) return help(message);

  const command = args.shift().toLowerCase();
  if (command in commands) {
    try {
      await commands[command](message, args);
    } catch (error) {
      console.error(error);
    }
  } else {
    await message.channel.send('Sorry, I don\'t understand :(');
    return help(message);
  }
});

function help(message) {
  return message.channel.send(`**__Available Commands:__**
\`portalhelp <x> <z>\`
\`list [category]\`
\`get <name>\`
\`set <category> <name> <location>\`
`);
}

function portalhelp(message, args) {
  if (args.length !== 2 || !args[0].match(/^-?[\d]+$/) || !args[1].match(/^-?[\d]+$/)) return sendUsage();
  let highway, road, number;
  const overworld = {
    x: parseInt(args[0], 10),
    z: parseInt(args[1], 10),
  };
  const nether = {
    x: Math.floor(overworld.x / 8),
    z: Math.floor(overworld.z / 8),
  }
  const xIsGeater = Math.abs(nether.x) > Math.abs(nether.z);

  if (xIsGeater) {
    number = Math.round(nether.x / 50) * 50;
    highway = nether.x > 0 ? 'East' : 'West';
    road = nether.z > 0 ? `South${highway}` : `North${highway}`;
  } else {
    number = Math.round(nether.z / 50) * 50;
    highway = nether.z > 0 ? 'South' : 'North';
    road = nether.x > 0 ? `${highway}East` : `${highway}West`;
  }

  return message.channel.send(`Your portal in the nether should be placed at x${nether.x} y80 z${nether.z} off of ${highway} ${road} ${number} Road`);
  function sendUsage() {
    return message.channel.send('Usage: !loc portalhelp <x> <z>');
  }
}

async function list(message, [ category ]) {
  const data = await json.get('locations');

  if (message.author.id === chatBot) {
    const channel = bot.guilds.array()[0].channels.get(consoleChatChannel);
    if (category) {
      const realCat = findCaseInsensitiveString(data, category);
      if (!realCat) return message.channel.send(`Invalid category "${category}"`);
      await channel.send(`tellraw @a {"text": "${categoryStringInGame(realCat, data)}"}`);
    } else {
      await channel.send(`tellraw @a {"text": "${allStringInGame(data)}"}`);
    }
  } else {
    if (category) {
      const realCat = findCaseInsensitiveString(data, category);
      if (!realCat) return message.channel.send(`Invalid category "${category}"`);
      await message.channel.send(categoryString(realCat, data));
    } else {
      await message.channel.send(allString(data));
    }
  }

}

async function get(message, [ name ]) {
  const data = await json.get('locations');
  for (let cat in data) {
    const realLoc = findCaseInsensitiveString(data[cat], name);
    if (realLoc) return message.channel.send(`${realLoc}: ${data[cat][realLoc]}`);
  }

  return message.channel.send(`"${name}" Not Found`);
}

async function set(message, [category, name, ...location]) {
  if (!category || !name || !location) return sendUsage();
  const data = await json.get('locations');
  if (!data.hasOwnProperty(category)) return message.channel.send(`Invalid category "${category}"`);

  await json.set(`locations.${category}.${name}`, location.join(' '));
  await syncpin();

  return message.channel.send(`"${name}" Saved!`);

  function sendUsage() {
    return message.channel.send('Usage: !loc set <category> <name> <location>');
  }
}

async function remove(message, [category, name]) {
  if (!category || !name) return sendUsage();
  const data = await json.get('locations');
  if (!data.hasOwnProperty(category)) return message.channel.send(`Invalid category "${category}"`);
  if (!data[category].hasOwnProperty(name)) return message.channel.send(`Invalid location "${name}"`);

  const cat = data[category];
  delete cat[name];
  await json.set(`locations.${category}`, cat);

  return message.channel.send(`"${name}" removed!`);

  function sendUsage() {
    return message.channel.send('Usage: !loc remove <category> <name>');
  }
}

async function newpin(message) {
  const data = await json.get('locations');
  const locationsString = await allString(data);
  const locationMessage = await message.channel.send(locationsString);

  await locationMessage.pin();
  await json.set('pinId', locationMessage.id);
  await json.set('pinChannel', locationMessage.channel.id);
  await message.delete();
}

async function syncpin(message) {
  if (message) await message.delete();

  const pinChannel = await json.get('pinChannel');
  const pinId = await json.get('pinId');

  const channel = bot.guilds.array()[0].channels.get(pinChannel);
  const pinnedMessage = await channel.fetchMessage(pinId);
  const data = await json.get('locations');

  const locationsString = await allString(data);
  await pinnedMessage.edit(locationsString);
}

function allString(data) {
  let string = '';
  for (let item in data) {
    string += categoryString(item, data);
  }

  return string;
}

function allStringInGame(data) {
  let string = '';
  for (let item in data) {
    string += categoryStringInGame(item, data);
  }

  return string;
}

function categoryString(category, data) {
  let string = `**${category}:**\n\`\`\``;
  const longestLength = Object.keys(data[category]).sort((a, b) => b.length - a.length)[0].length;

  for (let item in data[category]) {
    const s = data[category][item];
    string += `${rightpad(item, longestLength)} ${s}\n`;
  }

  string += '```';

  return string;
}

function categoryStringInGame(category, data) {
  const lengths = _.mapValues(data[category], (_, i) => calcLength(i));
  const longestLength = parseInt(_.values(lengths).sort((a, b) => parseInt(b) - parseInt(a))[0]);

  let string = `${category}:\\n`;
  for (let item in data[category]) {
    const s = data[category][item];
    const itemLength = parseInt(lengths[item]);
    const spacesToAdd = Math.floor(( longestLength - itemLength ) / 2);

    string += `${rightpad(item, item.length + spacesToAdd, '.')}...${s}\\n`;
  }

  return string;
}

function calcLength(string) {
  return string.split('').reduce((a, i) => {
    a+= charLengths.hasOwnProperty(i) ? charLengths[i] : 5;
    a+= 1;
    return a;
  }, 0);
}

function findCaseInsensitiveString(obj, string) {
  return _.findKey(obj, (i, k) => {
    return k.toLowerCase() === string.toLowerCase();
  });
}

bot.on('ready', () => {
  bot.user.setActivity('Chillin with ProxySaw');
});

bot.login(config.token);
