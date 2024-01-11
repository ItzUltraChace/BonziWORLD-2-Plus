var settingsSantize = {
    allowedTags: ["h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "p", "a", "ul", "ol", "nl", "li", "b", "i", "strong", "em", "strike", "code", "hr", "br", "div", "table", "thead", "caption", "tbody", "tr", "th", "td", "pre", "iframe", "marquee", "button", "input", "details", "summary", "progress", "meter", "font", "span", "select", "option", "abbr", "acronym", "adress", "article", "aside", "bdi", "bdo", "big", "center", "site", "data", "datalist", "dl", "del", "dfn", "dialog", "dir", "dl", "dt", "fieldset", "figure", "figcaption", "header", "ins", "kbd", "legend", "mark", "nav", "optgroup", "form", "q", "rp", "rt", "ruby", "s", "sample", "section", "small", "sub", "sup", "template", "textarea", "tt", "u"],
    allowedAttributes: {
        a: ["href", "name", "target"],
        p: ["align"],
        table: ["align", "border", "bgcolor", "cellpadding", "cellspadding", "frame", "rules", "width"],
        tbody: ["align", "valign"],
        tfoot: ["align", "valign"],
        td: ["align", "colspan", "headers", "nowrap"],
        th: ["align", "colspan", "headers", "nowrap"],
        textarea: ["cols", "dirname", "disabled", "placeholder", "maxlength", "readonly", "required", "rows", "wrap"],
        pre: ["width"],
        ol: ["compact", "reversed", "start", "type"],
        option: ["disabled"],
        optgroup: ["disabled", "label", "selected"],
        legend: ["align"],
        li: ["type", "value"],
        hr: ["align", "noshade", "size", "width"],
        fieldset: ["disabled"],
        dialog: ["open"],
        dir: ["compact"],
        bdo: ["dir"],
        marquee: ["behavior", "bgcolor", "direction", "width", "height", "loop", "scrollamount", "scrolldelay"],
        button: ["disabled"],
        input: ["value", "type", "disabled", "maxlength", "max", "min", "placeholder", "readonly", "required", "checked"],
        details: ["open"],
        div: ["align"],
        progress: ["value", "max"],
        meter: ["value", "max", "min", "optimum", "low", "high"],
        font: ["size", "family", "color"],
        select: ["disabled", "multiple", "require"],
        ul: ["type", "compact"],
        "*": ["hidden", "spellcheck", "title", "contenteditable", "data-style"],
    },
    selfClosing: ["img", "br", "hr", "area", "base", "basefont", "input", "link", "meta", "wbr"],
    allowedSchemes: ["http", "https", "ftp", "mailto", "data"],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: false,
};
const log = require("./log.js").log;
const Ban = require("./ban.js");
const Utils = require("./utils.js");
const io = require('./index.js').io;
const settings = require("./settings.json");
const sanitize = require('sanitize-html');

let roomsPublic = [];
let rooms = {};
let usersAll = [];

exports.beat = function() {
    io.on('connection', function(socket) {
        new User(socket);
    });
};

function checkRoomEmpty(room) {
    if (room.users.length != 0) return;

    log.info.log('debug', 'removeRoom', {
        room: room
    });

    let publicIndex = roomsPublic.indexOf(room.rid);
    if (publicIndex != -1)
        roomsPublic.splice(publicIndex, 1);

    room.deconstruct();
    delete rooms[room.rid];
    delete room;
}

class Room {
    constructor(rid, prefs) {
        this.rid = rid;
        this.prefs = prefs;
        this.users = [];
    }

    deconstruct() {
        try {
            this.users.forEach((user) => {
                user.disconnect();
            });
        } catch (e) {
            log.info.log('warn', 'roomDeconstruct', {
                e: e,
                thisCtx: this
            });
        }
        //delete this.rid;
        //delete this.prefs;
        //delete this.users;
    }

    isFull() {
        return this.users.length >= this.prefs.room_max;
    }

    join(user) {
        user.socket.join(this.rid);
        this.users.push(user);

        this.updateUser(user);
    }

    leave(user) {
        // HACK
        try {
            this.emit('leave', {
                 guid: user.guid
            });

            let userIndex = this.users.indexOf(user);

            if (userIndex == -1) return;
            this.users.splice(userIndex, 1);

            checkRoomEmpty(this);
        } catch(e) {
            log.info.log('warn', 'roomLeave', {
                e: e,
                thisCtx: this
            });
        }
    }

    updateUser(user) {
    this.emit('update', {
      guid: user.guid,
      userPublic: user.public
        });
    }

    getUsersPublic() {
        let usersPublic = {};
        this.users.forEach((user) => {
            usersPublic[user.guid] = user.public;
        });
        return usersPublic;
    }

    emit(cmd, data) {
    io.to(this.rid).emit(cmd, data);
    }
}

function newRoom(rid, prefs) {
    rooms[rid] = new Room(rid, prefs);
    log.info.log('debug', 'newRoom', {
        rid: rid
    });
}

let userCommands = {
    "godmode": function(word) {
        let success = word == this.room.prefs.godword;
        if (success){
            this.private.runlevel = 3;
            this.socket.emit('admin')
        }else{
            this.socket.emit('alert','Wrong password. Did you try "Password"? Or you\'ve got blocked by an admin.')
        }
        log.info.log('debug', 'godmode', {
            guid: this.guid,
            success: success
        });
    },
    "sanitize": function() {
        let sanitizeTerms = ["false", "off", "disable", "disabled", "f", "no", "n"];
        let argsString = Utils.argsString(arguments);
        this.private.sanitize = !sanitizeTerms.includes(argsString.toLowerCase());
    },
    "joke": function() {
        this.room.emit("joke", {
            guid: this.guid,
            rng: Math.random()
        });
    },
    "fact": function() {
        this.room.emit("fact", {
            guid: this.guid,
            rng: Math.random()
        });
    },
    "youtube": function(vidRaw) {

			if(vidRaw.includes("\"")){
        this.room.emit('talk',{
            text:`I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDIE LMAO`,
            guid:this.guid
        });
				return;
			}
			if(vidRaw.includes("'")){ 
        this.room.emit('talk',{
            text:`I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDIE LMAO`,
            guid:this.guid
        });
				return;
			}
        var vid = this.private.sanitize ? sanitize(vidRaw) : vidRaw;
        this.room.emit("youtube", {
            guid: this.guid,
            vid: vid
        });
    },
	"video": function(vidRaw){

			if(vidRaw.includes("\"")){
        this.room.emit('talk',{
            text:`I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDIE LMAO`,
            guid:this.guid
        });
				return;
			}
			if(vidRaw.includes("'")){ 
        this.room.emit('talk',{
            text:`I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDIE LMAO`,
            guid:this.guid
        });
				return;
			}
        var vid = this.private.sanitize ? sanitize(vidRaw) : vidRaw;
        this.room.emit("video", {
            guid: this.guid,
            vid: vid
        });
    },
	"image": function(vidRaw){

			if(vidRaw.includes("\"")){
        this.room.emit('talk',{
            text:`I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDIE LMAO`,
            guid:this.guid
        });
				return;
			}
			if(vidRaw.includes("'")){ 
        this.room.emit('talk',{
            text:`I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDIE LMAO`,
            guid:this.guid
        });
				return;
			}
        var vid = this.private.sanitize ? sanitize(vidRaw) : vidRaw;
        this.room.emit("image", {
            guid: this.guid,
            vid: vid
        });
    },
  kick:function(data){
      if(this.private.runlevel<3){
          this.socket.emit('alert','admin=true')
          return;
      }
        let pu = this.room.getUsersPublic()[data];
        if (pu && pu.color) {
            let target;
            this.room.users.map((n) => {
                if (n.guid == data) {
                    target = n;
                }
            });
            target.socket.emit("kick", {
                reason: "You got kicked.",
            });
            target.disconnect();
        } else {
          this.socket.emit('alert','The user you are trying to kick left. Get dunked on nerd.')
      }
  },
  css:function(...txt){
      this.room.emit('css',{
          guid:this.guid,
          css:txt.join(' ')
      })
  },
    ban:function(data){
        if(this.private.runlevel<3){
            this.socket.emit('alert','admin=true')
            return;
        }
        let pu = this.room.getUsersPublic()[data]
        if(pu&&pu.color){
            let target;
            this.room.users.map(n=>{
                if(n.guid==data){
                    target = n;
                }
            })
            if (target.socket.request.connection.remoteAddress == "::1"){
                Ban.removeBan(target.socket.request.connection.remoteAddress)
            } else if (target.socket.request.connection.remoteAddress == "::ffff:127.0.0.1"){
                Ban.removeBan(target.socket.request.connection.remoteAddress)
            } else {

                target.socket.emit("ban",{
                    reason:"You got banned. <br> You will no longer join Public Rooms."
                })
                Ban.addBan(target.socket.request.connection.remoteAddress, 24, "You got banned. <br> You will no longer join Public Rooms.");
            }
        }else{
            this.socket.emit('alert','The user you are trying to ban left. Get dunked on nerd.')
        }
    },
  "unban": function(ip) {
  Ban.removeBan(ip)
  },
    wtf: function (text) {
        var wtf = [
            "i cut a hole in my computer so i can fuck it",
            "i hate minorities",
            "i said /godmode password and it didnt work",
            "i like to imagine i have sex with my little pony characters",
            "ok yall are grounded grounded grounded grounded grounded grounded grounded grounded grounded for 64390863098630985 years go to ur room",
            "i like to eat dog crap off the ground",
            "i can use inspect element to change your name so i can bully you",
            "i can ban you, my dad is seamus",
            "why do woman reject me, i know i masturbate in public and dont shower but still",
            "put your dick in my nose and lets have nasal sex",
            "my cock is 6 ft so ladies please suck it",
            "please make pope free",
            "whats that color",
            "I got a question. but it's a serious, yes, serious thing that I have to say! AAAAAAAAAAA! I! am! not! made! by! Pixel works! Pixel works doesn't make microsoft agent videos! Kieran G&A Doesn't exist! Anymore! So, if you guys keep mocking me that i am made by Pixel works (Originally Aqua) or Kieran G&A, then i am gonna commit kill you! huff, puff, that is all.",
            "This PC cannot run Windows 11. The processor isn't supported for Windows 11. While this PC doesn't meet the system requirements, you'll keep getting Windows 10 Updates.",
            "I made Red Brain Productions, and i deny that i am made by Pixelworks",
            "100. Continue.",
            "418. I'm a teapot.",
            "I am SonicFan08 and i like Norbika9Entertainment and grounded videos! Wow! I also block people who call me a gotard!",
            "When BonziWORLD leaks your memory, your system will go AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "Bonkey sugar. Anything that makes one physically satisfied. By extension, anything good or desirable. The following are examples of things which are most certainly bonkey sugar...",
            "i like to harass bonziworld fans on bonziworld",
            "there is a fucking white bird in my chest please get him out",
            "i am that frog that is speaking chinese",
            "i don't let anyone have any fun like holy shit i hate bonziworld soooooooooo much!",
            "i make gore art out of dream as fucking usual",
            "yummy yummy two letter object in my tummy! yummy in my tummy! i pretend to be david and terrorize the fuck out of my friends!",
            "why the fuck are you hating Twitter?! what did they do to you?!",
            "seamus has a weird- NO YOU FUCKING DONT! YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY! [[ IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII",
            "This is not a test. You have been caught as a 'funny child harassment' moment. you will be banned. You got banned! Why? Being retarded? IDK. You literally harass BonziWORLD Fans. How dare you!",
            "fingerprinting on bonzi.world is giving out your location! real! not fake!",
            "how many fucking times have i told you? GIVE ME THE MARIO 64 BETA ROM NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW NOW!",
            "<p hidden> i have nothing to say </p>",
            "Yeah, of course " + this.public.name + " wants me to use /wtf. [[???????????]] Hah hah! Look at the stupid " + this.public.color + " Microsoft Agent character embarassing himself! Fuck you. It isn't funny.",
            "I am getting fucking tired of you using this command. Fucking take a break already!",
            "DeviantArt",
            "You're a [['fVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVkjng]] asshole!",
            "javascript",
            "BonziWORLD.exe has encountered and error and needs to close. Nah, seriously, you caused this error to happen because you used /wtf.",
            "moo!",
            "host bathbomb",
            "Hi.",
            "hiii i'm soundcard from mapper league",
            "I injected some soundcard syringes into your browser. <small>this is obviously fake</small>",
            "--image <img class=no_selection src=//cdn.discordapp.com/emojis/854164241527209995.gif?v=1 draggable=false></img>",
            "i listen to baby from justin bieber",
            "i watch numberblocks",
            "i watch doodland and now people are calling me a doodtard",
            "i watch bfdi and now people are calling me a objecttard",
            "i post klasky csupo effects and now people are calling me a logotard",
            "i inflate people, and body inflation is my fetish.",
            "i installed BonziBUDDY on my pc and now i have a virus",
            "i deleted system32",
            "i flood servers, and that makes me cool.",
            "I unironically do ERPs that has body inflation fetishism with people. Do you have a problem with that? YES! INFLATION FUCKING SUCKS YOU STUPID PERSON NAMED GERI!",
            "I unironically do ERPs that has body inflation fetishism with people. Do you have a problem with that? YES! INFLATION FUCKING SUCKS YOU STUPID PERSON NAMED BOWGART!",
            "I unironically do ERPs that has body inflation fetishism with people. Do you have a problem with that? YES! INFLATION FUCKING SUCKS YOU STUPID PERSON NAMED POM POM!",
            "I unironically do ERPs that has body inflation fetishism with people. Do you have a problem with that? YES! INFLATION FUCKING SUCKS YOU STUPID PERSON NAMED WHITTY!",
            "Hi. My name is DanielTR52 and i change my fucking mind every 1 picosecond. Also, ICS fucking sucks. Nope, now he doesnt. Now he does. Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.  Now he doesnt. Now he does.",
            "i still use the wii u&trade;",
            "i used homebrew on my nintendo switch and i got banned",
            "i bricked my wii",
            "muda muda muda muda!",
            "i am going to post inflation videos because, remember: 'I inflate people and inflation is my fetish.'",
            "i copy other people's usernames",
            "i use microsoft agent scripting helper for fighting videos against innocent people that did nothing wrong by just friendly commenting",
            "i use microsoft agent scripting helper for gotard videos",
            "i use hotswap for my xbox 360",
            "i boycotted left 4 dead 2",
            "CAN U PLZ UNBAN ME PLZ PLZ PLZ PLZ PLZ PLZ PLZ PLZ",
            "Hey, " + this.public.name + " You're a fucking asshole!",
            "Damn, " + this.public.name + " really likes /wtf",
            "I use an leaked build of Windows 11 on my computer.",
            "Do you know how much /wtf quotes are there?",
            "Fun Fact: You're a fucking asshole",
            "i watch body inflation videos on youtube",
            "ItzCrazyScout, No! More like.... ekfheiophjeodxenwobifuodhndoxnwsiohbdeiowdhn2werifhwefief! He banned euhdeioqwdheiwohjixzojqsioh r23oipwshnwq! End of rant.",
            "Pro Hacker: NEAGEUR! [[llllllllllllll]] NEAGEUR!",
            "i play left 4 dead games 24/7",
            "i am so cool. i shit on people, add reactions  that make fun of users on discord, and abuse my admin powers. i am really so cool.",
            "This product will not operate when connected to a device which makes unauthorized copies. Please refer to your instruction booklet for more information.",
            "hey medic i like doodland",
            "i installed windows xp on my real computer",
            "i am whistler and i like to say no u all the time",
            "HEY EVERYONE LOOK AT ME I USE NO U ALL THE TIME LMAO",
            "i like to give my viewers anxiety",
            "how to make a bonziworld server?",
            "shock, blood loss, infection; [['oU: hoUhoUhoUhoU]]! i love stabbing!",
            "I AM ANGRY BECAUSE I GOT BANNED! I WILL MAKE A MASH VIDEO OUT OF ME GETTING BANNED!",
            "oh you're approaching me!",
            "MUTED! HEY EVERYONE LOOK AT ME I SAY MUTED IN ALL CAPS WHEN I MUTE SOMEONE LMAO",
            "can you boost my server? no? you're mean!>:(",
            "no u",
            "numberblocks is my fetish",
            "#inflation big haram",
            "Sorry, i don't want you anymore.",
            "Twitter Cancel Culture! Twitter Cancel Culture! Twitter Cancel Culture! Twitter Cancel Culture! Twitter Cancel Culture!",
            "cry about it",
            "<p hidden>[[??????????????????????????????????????????????????????????????????????????????????????]] Hello? Is anyone there? Please help me!</p>",
            "SyntaxError: Unexpected string",
            "i post random gummibar videos on bonziworld",
            "i support meatballmars",
            "PLEASE GIVE THIS VIDEO LIKES!!!!! I CANNOT TAKE IT ANYMORE!",
            "I WILL MAKE A BAD VIDEO OUT OF YOU! GRRRRRRRRRRRR!",
            "Muted",
            "i keep watching doodland like forever now",
            "i mined diamonds with a wooden pickaxe",
            "i kept asking for admin and now i got muted",
            "I FAP TO FEMMEPYRO NO JOKE",
            "i like to imagine that i am getting so fat for no reason at all",
            "i am not kid",
            "i want mario beta rom hack now!",
            "i am a gamer girl yes not man no im not man i am gamer girl so give me money and ill giv you my adress ♥♥",
            "i used grounded threats and now i got hate",
            "i post pbs kids and now people are calling me a pbskidstard",
            "Oh my gosh! PBS Kids new logo came on July 19th!",
            "i will flood the server but people still thinked that i will not flood, the flooder hates are psychopaths, a skiddie, psychology and mentallity",
            "i used inspect element and now i got hate",
            "hi i am vacbedlover want to show my sexual fetish. I just kept evading my ban on collabvm to act like a forkie.",
            "i watch the potty song and now people are calling me a pottytard",
            "bonziworld reacts to... zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
            "i am danieltr52 the clown and i have inflation fetish",
            "i watch nature on pbs",
            "i post thomas theme song and now people are calling me a thomastard",
            "i pee my pants",
            "Wow! TVOKids is awesome- No! Its not awesome, you idiotic TVOKids fan!",
            "i watch grounded videos and now people are calling me a gotard",
            "Hi i am DanielTR52 and i have inflation fetish my friends please hate on seamus from making bad videos out of me",
            "Excuse me, CUT! We made another color blooper! glass breaking sound effect WAAAAAAAAAAAA! inhale WAAAAAAAAAAAA! Well that was uncalled for. It was! Anyways, you guys are in the colors of the AidenTV logo. Looks down BOING! Oh, oops. It's okay, swap the colors back to normal and then we'll do Take 48! Snap",
            "DOGGIS!",
            "i watch bfb and now people are calling me a objecttard",
            "This is not a test. You have been caught as a 'funny child harassment' moment. you will be banned. You got banned! Why? Being retarded? IDK. You literally harass BonziWORLD Fans. How dare you!",
            "fingerprinting on bonzi.world is giving out your location! real! not fake!",
            "i post pinkfong the potty song and now people are calling me a pinkfongtard",
            "my favorite flash nickelodeon clickamajig is Dress Up Sunny Funny",
            "i snort dill pickle popcorn seasoning",
            "i listen to planet custard's greated song, the potty song and now i got hate",
            "I got a question. but it's a serious, yes, serious thing that I have to say! AAAAAAAAAAA! I! am! not! made! by! Pixel works! Pixel works doesn't make microsoft agent videos! Kieran G&A Doesn't exist! Anymore! So, if you guys keep mocking me that i am made by Pixel works (Originally Aqua) or Kieran G&A, then i am gonna commit kill you! huff, puff, that is all.",
            "This PC cannot run Windows 11. The processor isn't supported for Windows 11. While this PC doesn't meet the system requirements, you'll keep getting Windows 10 Updates.",
            "I made Red Brain Productions, and i deny that i am made by Pixelworks",
            "I am SonicFan08 and i like Norbika9Entertainment and grounded videos! Wow! I also block people who call me a gotard!",
            "When BonziWORLD leaks your memory, your system will go AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "i post i got banned on bonziworld and now i got hate",
            "i post babytv and now people are calling me a babytvtard",
            "i post sf08 news and now i got hate",
            "i listen to spongebob theme song and now i got hate",
			"What the fuck did you just fucking say about me, you little bitch? I'll have you know I graduated top of my class in the Navy Seals, and I've been involved in numerous secret raids on Al-Quaeda, and I have over 300 confirmed kills. I am trained in gorilla warfare and I'm the top sniper in the entire US armed forces. You are nothing to me but just another target. I will wipe you the fuck out with precision the likes of which has never been seen before on this Earth, mark my fucking words. You think you can get away with saying that shit to me over the Internet? Think again, fucker. As we speak I am contacting my secret network of spies across the USA and your IP is being traced right now so you better prepare for the storm, maggot. The storm that wipes out the pathetic little thing you call your life. You're fucking dead, kid. I can be anywhere, anytime, and I can kill you in over seven hundred ways, and that's just with my bare hands. Not only am I extensively trained in unarmed combat, but I have access to the entire arsenal of the United States Marine Corps and I will use it to its full extent to wipe your miserable ass off the face of the continent, you little shit. If only you could have known what unholy retribution your little 'clever' comment was about to bring down upon you, maybe you would have held your fucking tongue. But you couldn't, you didn't, and now you're paying the price, you goddamn idiot. I will shit fury all over you and you will drown in it. You're fucking dead, skiddo.",
          "Fune: BANZI.LEL BEST SERVA!",
          "PinkFong: PANK FUNG BEST CHENNAL!",
          "Hogi: HO-GEE BEST CHENNAL!",
          "Baby Shark Brooklyn: BEBY SHARK BRUKKLYN BEST CHENNAL!",
          "i support fune",
          "i support pinkfong",
          "i support hogi",
          "i support baby shark brooklyn",
          "bonzi.lol is the best site ever!",
          "Pinkfong is the best channel ever!",
          "Hogi is the best channel ever!",
          "Bebefinn is the best channel ever!",
          "Baby Shark Broolyn is the best channel ever!",
          "seamus is a pe- NO YOU FUCKING DON'T!",
          "seamus is a nig- NO YOU FUCKING DON'T!",
          "bonzipedia is the best wiki ever",
          "baby shark is the best song ever",
          "The Potty Song is the best song ever",
          "Hello my name is fune and i am obsessed with pedos and groomers so much that i accuse random people of being a pedo and a groomer without any proof and also like to make fake screenshots out of them doing disgusting shit.",
          "Hello my name is pinkfong and i am obsessed with baby shark, nursery rhymes and the potty song so much that i accuse random people of being a pinkfong fan and a nursery rhyme supporter and also like to make nursery rhyme song shit.",
          "I LIKE PINKFONG! ALSO HOGI IS A THE BEST!!!! I HATE PINKFONG HATERS!!! PINKFONG IS THE BEST!!!!!",
          "I LIKE FUNE! ALSO NANO IS A THE BEST!!!! I HATE OTHER BONZIWORLD SITES!!! BONZI DOT LOL IS A THE BEST!!!!!",
          "THE POTTY SONG IS THE BEST!",
          'i keep watching the potty song like forever now. "How do I use a potty?" ',
          "choccy milk is good",
          "My name is goober and i'm totally not a spy!",
          "bonziworld gave me ptsd",
          "you got trolled!",
          "PURGE! PURGE! DESTROY ALL NEW YEARS! I HATE 2021 SO MUCH! PURGE!",
          "I actually believe in fune's false allegations",
          "Lambda Fortress Community Edition is so good that it's better than this shid site",
          "I AM NOT KID",
          "WE'RE GONNA BEAT YA TO DEATH",
            "i support juny and tony",
        "JunyTony: JOONEE-TONEE BEST CHENNAL!",
        "Bebefinn: BEYBEYFYNN BEST CHENNAL!",
        "i want to live in a foxs butthole",
        "i post baby shark and now people are calling me a babysharktard",
        "i post pinkfong wash your hands and now i got hate",
        "i post i got banned on bonziworld revived and now i got hate",
        "i abuse javascript and now i got hate",
        "i used losky virus and now i got hate",
        "i post baby einstein and now people are calling me a babyeinsteintard",
        "i post Baby Einstein Caterpillar logo and now people are calling me a Baby EinsteinTard", // BonziUSER is the Baby Einstein enthusiast lol
	"i post lol sparta and now people are calling me a spartaremixtard",
        "i post juny&tony and now people are calling me a JunyTonytard",
        "Hi i am Hogi and i am obsessed with nursery rhymes that i accuse random people of being a supporter of me and my fans and i am also with pinkfong and also like to post nursery rhyme shit.",
	"Hi i am Baby Shark and i am obsessed with my own song that i accuse random people of being my fan and also like to do baby shark-related shits by pinkfong.",
	"hi i am some fatass named flooder master and i am obsessed with some floodings that i accuse random people of getting flooded and also like to use JS scripts to flood bonziworld server shits.",
	"i keep flooding bonziworld servers like forever now",
	`SpongeBob SquarePants sucks- NO! It does not suck, you idiotic "SpongeBob" hater!`,
	"i destroy bonziworld 2 and now i got hate",
	"i post pinkfong potty training song and now i got hate",
	"i post pinkfong don't hold it in and now i got hate",
	"i post pinkfong it's poo poo time and now i got hate",
	"i post poo poo song by yearimTV and now i got hate",
	"i post bonzi.lol content and now i got hate",
        'PASSpie999forU doesnt work help',
        'i like to drink water from an unflushed toilet',
        'im not racist but i hate black people',
        'no homo but you wanna have gay sex?',
        'i mute everyone so they cant talk',
        'i like images where furries fart in a bathtub to make bubbles',
        '(after having sex with mother) I am no mamas boy, she made me a mamas man.',
        'nigger fuck shit bitch sex ass dick tit cunt porn haha i can offend You',
        'i love it when my crush forgets to flush the toilet so i can put her poop in my asshole',
	'i use collaborative virtual machine to install malware',
	"i post baby shark's potty song and now i got hate",
	"i told seamus to stop stealing assets from other servers when he didn't and now i got hate",
    "i said sex me daddy and now i got hate",
    "i post sex content and now i got despited and banned forever",
    "hi i am dyslexic and i am the most wanted faith golden lover alternative who loves to ruin bonziworld with sexs, moans, n word pass's, floodings, unmutable hackings and skript skiddie script shits and i also like to post i got banned on bonziworld video shits.", //fuck you dyslexic, and fuck tor too
    "i post bonziworld 2 destruction videos and now i got hate",
    //these wtf messages from the s!help bot were from onute, and s!help bot is useless in bonziworld 2+ forever. so fuckin' useless. shown below
    "i reinstalled windows many times cuz i got virus this is a challenge",
	"i criticized ics for good-for-nothing reason becuz i wared the repulsive peopl",
	"i deleted system32 on my computer and i am playing fortnite with freakin deleted system32 folder lmao",
	"i play roblox every day and i got 999999999 robux for free",
	"i play pickcrafter to get null blocks for 10000",
	"i reporting google apps to be suspended for good but it dont work i have to go to the google headquarters to bomb this headquarter with a massively cells tablets and i hope Google servers ever died eventually and they never browse on internet forever and they need to move to another search engine",
	"i made the fucking greatest cake - the fucking poopcake, how about you will join the shitty party?",
	"i made the clown robot :clown:",
	"i default danced by using my dance like fortnight and steps around tatatatata lala lala lala lalalala",
	"i hated les inexusibles for nothing",
	"i made the good videos but they not watching betray us",
	"ics wont leave me alone because i did something wrong with",
	"ics is fucking grounded go to your room immediately you scoutfag you are fucking compensated and meaned",
	"i sorried to ics but she didnt accept my apology i think i will die",
	"itzcrazyscout shoot my head please say goodbye",
	"itzcrazyscout terminate my channel plz",
	"ics please ground me RIGHT NOW i give your mass of hard drive whatever",
	"i hypocrited my opinions doing as myself",
	"engage me itzcrazyscout engage me right nooooooooooooooooooooooooooooow",
	"im playing minecraft on hardcore mode and then i lost my items in 0 score points",
	"i play lg sta-p53es i type any number wish we want",
	"mommy ona i didnt do anything wrong he impersonated me can you report him please",
	"Danielius paulavičius mom i am not a fault, i can\'t through this channel because they impersonating me for no apparent reason",
	"i created nkyt show account and now they will hate me for hard shit",
	"i reported to nkyt and arsikphonegreat but it didnt work i have to hack this account and delete with these all videos and alts",
	"i hacked itzcrazyscout\'s computer i deleted system32 folder for admin abusing stall they will not gonna to recover this computer this is will pay for this for ADMIN ABUSING!!!",
	"i hacked zander blake\'s computer and i steal the files",
	"itzcrazyscout hacked my computer i have to turn off wifi to prevent hacks *turns off* thats good.",
	"ics doxxed my ip information now i have to assign another ip to improve my brain cells and buy the ip",
	"i buyed the shitty pirated site then i got dmca\'ed",
	"i love losky so much but ics still hates me and knows me i am, ics is a psychopath, psychology and mentality",
	"i forcing seamusmario to love and hug losky with loving syringe",
	"ics prepare to die get stomach exploded you ass cockroach adminfag",
	"my friend ics and itzchris are watching oggy and the cockroaches within all of episodes",
	"whatsoever, ics. tell your real born date and real name, if you dont i will poop on your head with the bucket and what\'s you will get deserve not giving the name and date",
	"ics goes to jail becuz he is a parole, quadruple killer, people banishment, aura killer and such of a things i think he is a kiddie for now permanent",
	"crazy shut this server down because you are admin abuser and bullying me like an ass of jolly",
	"i unbanned on bonziworld 2 discord server with vpn or i changed the ip address and works finally",
	"i imagine for my little pony friendship is magic characters to sex with twilight sparkle, rainbow dash, applejack, pinkie pie, rarity, fluttershy, spike, princess celestia, sweetie belle, big mac, derpy hooves and more",
	"i dislike bot thekantapapa videos for no reason",
	"i read the rules in one second on bonziworld 2",
	"give the bonziworld 3 for now",
	"i say the n word at everyone and now i got hate",
	"itzcrazyscout? no? more like itzfuckshitout! oh my god this user sucks i hate this man die this shitass forever and ever and ever and ever",
	"i do play classic games on samsung sgh-c160m when i cry everytim",
	"i installed windows xp and works fine and silently",
	"i am upgraded to intel i9-9900k from a old i3 processor",
	"i stole the republic of gamers pc and runs very very very excellent so faithful as vary",
	"i copied nkyt videos for samsung sgh like fucking shit nigga nkyt show",
	"bonziworld fe is much better than bonzi.world",
	"i reported bagelchip for inappropriate swear on discord terms of safety",
	"i banned all of users becus i hacked him every user no matter she tries to fuck me and ban me like an loser",
	"i hate my life i die",
	"i bought full of sgh phones and got diamond! about crap of 100000 diamonties purchased as lol",
	"bixby please skip this shit right now, i want to talk you please",
	"i hacked every account running bonziworld and ruining codes muhahahahahaha"
        ];
        var num = Math.floor(Math.random() * wtf.length);
        this.room.emit("talk", {
            text: wtf[num],
            guid: this.guid,
        });
        this.room.emit("wtf", {
            text: wtf[num],
            guid: this.guid,
        });
    },
    "swag": function() {
        this.room.emit("swag", {
            guid: this.guid
        });
    },
    "bang": function() {
        this.room.emit("bang", {
            guid: this.guid
        });
    },
    "earth": function() {
        this.room.emit("earth", {
            guid: this.guid
        });
    },
    "grin": function() {
        this.room.emit("grin", {
            guid: this.guid
        });
    },
	"clap":function(){
		this.room.emit("clap", {
		  guid: this.guid,
		});
	},
    "shrug": function() {
        this.room.emit("shrug", {
            guid: this.guid,
        });
    },
    "greet": function() {
        this.room.emit("greet", {
            guid: this.guid,
        });
    },
  sendraw:function(...txt){
      this.room.emit('sendraw',{
          guid:this.guid,
          text:txt.join(' ')
      })
  },
    "godlevel":function(){
        this.socket.emit("alert","Your godlevel is " + this.private.runlevel + ".")
    },
    "broadcast":function(...text){
        this.room.emit("alert",text.join(' '))
    },
    "backflip": function(swag) {
        this.room.emit("backflip", {
            guid: this.guid,
            swag: swag == "swag"
        });
    },
    "surf": function() {
        this.room.emit("surf", {
            guid: this.guid,
        });
    },
    "linux": "passthrough",
    "pawn": "passthrough",
    "bees": "passthrough",
    "color": function(color) {
        if (typeof color != "undefined") {
            if (settings.bonziColors.indexOf(color) == -1)
                return;

            this.public.color = color;
        } else {
            let bc = settings.bonziColors;
            this.public.color = bc[
                Math.floor(Math.random() * bc.length)
            ];
        }

        this.room.updateUser(this);
    },
	"pope": function() {
		if (this.private.runlevel === 3) { // removing this will cause chaos
			this.public.color = "pope";
			this.room.updateUser(this);
		} else {
			this.socket.emit("alert", "Ah ah ah! You didn't say the magic word!")
		}
    },
  removeadminflag: function () {
      this.public.flags.admin = false;
      this.room.updateUser(this);
  },
	
	"god": function() {
		if (this.private.runlevel === 3) // removing this will cause chaos
		{
			this.public.color = "god";
			this.room.updateUser(this);
		}
		else
		{
			this.socket.emit("alert", "Ah ah ah! You didn't say the magic word!")
		}
    },
	
	"god2": function() {
		if (this.private.runlevel === 3) // removing this will cause chaos
		{
			this.public.color = "old_god";
			this.room.updateUser(this);
		}
		else
		{
			this.socket.emit("alert", "Ah ah ah! You didn't say the magic word!")
		}
    },
	
	"god3": function() {
		if (this.private.runlevel === 3) // removing this will cause chaos
		{
			this.public.color = "omega";
			this.room.updateUser(this);
		}
		else
		{
			this.socket.emit("alert", "Ah ah ah! You didn't say the magic word!")
		}
    },
    "asshole": function() {
        this.room.emit("asshole", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "beggar": function() {
        this.room.emit("beggar", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "kiddie": function() {
        this.room.emit("kiddie", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "gofag": function() {
        this.room.emit("gofag", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "logofag": function() {
        this.room.emit("logofag", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "forcer": function() {
        this.room.emit("forcer", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "welcome": function() {
        this.room.emit("welcome", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "owo": function() {
        this.room.emit("owo", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "uwu": function() {
        this.room.emit("uwu", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "blackhat": function() {
        this.room.emit("blackhat", {
            guid: this.guid
        });
    },
    "navy_seals": function() {
        this.room.emit("navy_seals", {
            guid: this.guid
        });
    },
    "triggered": "passthrough",
    "vaporwave": function() {
        this.socket.emit("vaporwave");
        this.room.emit("youtube", {
            guid: this.guid,
            vid: "aQkPcPqTq4M"
        });
    },
    "unvaporwave": function() {
        this.socket.emit("unvaporwave");
    },
    "name": function() {
        let argsString = Utils.argsString(arguments);
        if (argsString.length > this.room.prefs.name_limit)
            return;

        let name = argsString || this.room.prefs.defaultName;
        this.public.name = this.private.sanitize ? sanitize(name) : name;
        this.room.updateUser(this);
    },
    "group":function(...text){
        text = text.join(" ")
        if(text){
            this.private.group = text + ""
            this.socket.emit("alert","joined the group")
            return
        }
        this.socket.emit("alert","enter a group id")
    },
    "dm":function(...text){
        text = text.join(" ")
        text = sanitize(text,settingsSantize)
        if(!this.private.group){
            this.socket.emit("alert","join a group first")
            return
        }
        this.room.users.map(n=>{
            if(this.private.group === n.private.group){
                n.socket.emit("talk",{
                    guid:this.guid,
                    text:"<small><i>Only your group can see this.</i></small><br>"+text,
                    say:text
                })
            }
        })
    },
    "pitch": function(pitch) {
        pitch = parseInt(pitch);

        if (isNaN(pitch)) return;

        this.public.pitch = Math.max(
            Math.min(
                parseInt(pitch),
                this.room.prefs.pitch.max
            ),
            this.room.prefs.pitch.min
        );

        this.room.updateUser(this);
    },
    "speed": function(speed) {
        speed = parseInt(speed);

        if (isNaN(speed)) return;

        this.public.speed = Math.max(
            Math.min(
                parseInt(speed),
                this.room.prefs.speed.max
            ),
            this.room.prefs.speed.min
        );

        this.room.updateUser(this);
    }
};


class User {
    constructor(socket) {
        this.guid = Utils.guidGen();
        this.socket = socket;

        // Handle ban
      if (Ban.isBanned(this.getIp())) {
            Ban.handleBan(this.socket);
        }

        this.private = {
            login: false,
            sanitize: true,
            runlevel: 0
        };
          this.public = {
              color: settings.bonziColors[Math.floor(
                  Math.random() * settings.bonziColors.length
              )],
              color_cross: "none",
              hue: 0,
              saturation: 100,
              flags: {
                  admin: false,
                  nocolor: false,
              },
          };

        log.access.log('info', 'connect', {
            guid: this.guid,
            ip: this.getIp(),
          userAgent: this.getAgent(),
        });

       this.socket.on('login', this.login.bind(this));
    }

    getIp() {
        return this.socket.request.connection.remoteAddress;
    }

    getPort() {
        return this.socket.handshake.address.port;
    }

    login(data) {
        if (typeof data != 'object') return; // Crash fix (issue #9)

        if (this.private.login) return;

    log.info.log('info', 'login', {
      guid: this.guid,
        });

        let rid = data.room;

    // Check if room was explicitly specified
    var roomSpecified = true;

    // If not, set room to public
    if ((typeof rid == "undefined") || (rid === "")) {
      rid = roomsPublic[Math.max(roomsPublic.length - 1, 0)];
      roomSpecified = false;
    }
    log.info.log('debug', 'roomSpecified', {
      guid: this.guid,
      roomSpecified: roomSpecified
        });

    // If private room
    if (roomSpecified) {
            if (sanitize(rid) != rid) {
                this.socket.emit("loginFail", {
                    reason: "nameMal"
                });
                return;
            }

      // If room does not yet exist
      if (typeof rooms[rid] == "undefined") {
        // Clone default settings
        var tmpPrefs = JSON.parse(JSON.stringify(settings.prefs.private));
        // Set owner
        tmpPrefs.owner = this.guid;
                newRoom(rid, tmpPrefs);
      }
      // If room is full, fail login
      else if (rooms[rid].isFull()) {
        log.info.log('debug', 'loginFail', {
          guid: this.guid,
          reason: "full"
        });
        return this.socket.emit("loginFail", {
          reason: "full"
        });
      }
    // If public room
    } else {
      // If room does not exist or is full, create new room
      if ((typeof rooms[rid] == "undefined") || rooms[rid].isFull()) {
        rid = Utils.guidGen();
        roomsPublic.push(rid);
        // Create room
        newRoom(rid, settings.prefs.public);
      }
        }

        this.room = rooms[rid];

        // Check name
    this.public.name = sanitize(data.name) || this.room.prefs.defaultName;

    if (this.public.name.length > this.room.prefs.name_limit)
      return this.socket.emit("loginFail", {
        reason: "nameLength"
      });

    if (this.room.prefs.speed.default == "random")
      this.public.speed = Utils.randomRangeInt(
        this.room.prefs.speed.min,
        this.room.prefs.speed.max
      );
    else this.public.speed = this.room.prefs.speed.default;

    if (this.room.prefs.pitch.default == "random")
      this.public.pitch = Utils.randomRangeInt(
        this.room.prefs.pitch.min,
        this.room.prefs.pitch.max
      );
    else this.public.pitch = this.room.prefs.pitch.default;

        // Join room
        this.room.join(this);

        this.private.login = true;
        this.socket.removeAllListeners("login");

    // Send all user info
    this.socket.emit('updateAll', {
      usersPublic: this.room.getUsersPublic()
    });

    // Send room info
    this.socket.emit('room', {
      room: rid,
      isOwner: this.room.prefs.owner == this.guid,
      isPublic: roomsPublic.indexOf(rid) != -1
    });

        this.socket.on('talk', this.talk.bind(this));
        this.socket.on('command', this.command.bind(this));
        this.socket.on('disconnect', this.disconnect.bind(this));
    }

    talk(data) {
        if (typeof data != 'object') { // Crash fix (issue #9)
            data = {
                text: "HEY EVERYONE LOOK AT ME I'M TRYING TO SCREW WITH THE SERVER LMAO"
            };
        }

        log.info.log('debug', 'talk', {
            guid: this.guid,
            text: data.text,
            say:sanitize(data.text,{allowedTags: []})
        });

        if (typeof data.text == "undefined")
            return;

        let text;
        if(this.room.rid.startsWith('js-')){
            text = data.text
        }else{
            text = this.private.sanitize ? sanitize(data.text+"",settingsSantize) : data.text;
        }
        if ((text.length <= this.room.prefs.char_limit) && (text.length > 0)) {
            this.room.emit('talk', {
                guid: this.guid,
                text: text,
                say: sanitize(text,{allowedTags: []})
            });
        }
    }

    command(data) {
        if (typeof data != 'object') return; // Crash fix (issue #9)

        var command;
        var args;

        try {
            var list = data.list;
            command = list[0].toLowerCase();
            args = list.slice(1);

            log.info.log('debug', command, {
                guid: this.guid,
                args: args
            });

            if (this.private.runlevel >= (this.room.prefs.runlevel[command] || 0)) {
                let commandFunc = userCommands[command];
                if (commandFunc == "passthrough")
                    this.room.emit(command, {
                        "guid": this.guid
                    });
                else commandFunc.apply(this, args);
            } else
                this.socket.emit('commandFail', {
                    reason: "runlevel"
                });
        } catch(e) {
            log.info.log('debug', 'commandFail', {
                guid: this.guid,
                command: command,
                args: args,
                reason: "unknown",
                exception: e
            });
            this.socket.emit('commandFail', {
                reason: "unknown"
            });
        }
    }

    disconnect() {
    let ip = "N/A";
    let port = "N/A";

    try {
      ip = this.getIp();
      port = this.getPort();
    } catch(e) { 
      log.info.log('warn', "exception", {
        guid: this.guid,
        exception: e
      });
    }

    log.access.log('info', 'disconnect', {
      guid: this.guid,
      ip: ip,
      port: port
    });

        this.socket.broadcast.emit('leave', {
            guid: this.guid
        });

        this.socket.removeAllListeners('talk');
        this.socket.removeAllListeners('command');
        this.socket.removeAllListeners('disconnect');

        this.room.leave(this);
    }
}
