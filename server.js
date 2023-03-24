const WebSocket = require("ws");
const Engine = require("./engine");
const { StringDecoder } = require("string_decoder");

const decoder = new StringDecoder('utf8');
var game_data = {
	"character": {
		"variants": [
			"green"
		],
		"radius": 40
	},
	"world": {
		"biome": {
			"forest": {
				"ground": {},
				"tree": {
					"radius": 50,
					"size": 180
				},
				"boulder": {
					"radius": 60,
					"size": 130
				}
			}
		}
	}
}
var nodes = new Set();
var characters = new Set();
var server_fps = 20;
var player_render_distance = 1000;
var port = 8080;
var max_player_speed = 500;

function message(type, data, from) {
    if (type === "movement") {
        if ("position" in data) {
            try {
                let new_position = new Engine.vector(data.position.x, data.position.y);
                if (from.position.distance_to(new_position) <= max_player_speed / server_fps) {
                    from.position.x = new_position.x;
                    from.position.y = new_position.y;
                }
                else {
                    var to_send = {
                        "type": "position_update",
                        "data": {
                            "position": {
                                "x": from.position.x,
                                "y": from.position.y
                            }
                        }
                    }
                    from.socket.send(JSON.stringify(to_send));
                }
            }
            catch(err) {
                console.log(from.username + ": Bad position packet!");
                console.log(err);
            }
        }
        if ("rotation" in data) {
            from.rotation = data.rotation;
        }
    }


    else {
        console.log(from.username + ": Bad packet!");
        console.log(type);
        console.dir(data);
    }
}

var server = new WebSocket.Server({
	port: port
});
console.log("Server has started on port " + port);

server.on("connection", function (socket, request) {
    socket.on("message", function(msg) {
        let boffer = Buffer.from(msg);
		let data = JSON.parse(decoder.write(boffer));
        if (data.type === "init") {  //character joins
            let this_username = "Anonymous";
            let this_variant = 0;
            if ("username" in data.data) {
                this_username = data.data.username;
            }
            if ("variant" in data.data) {
                if (data.data.variant >= 0 < game_data.character.variants.length) {
                    this_variant = Math.round(data.data.variant);
                }
            }
            let this_player = new Engine.character(new Engine.vector(0, 0), 0, 0, this_username, socket);
            this_player.id = Engine.create_id();
            characters.add(this_player);

            socket.send(JSON.stringify({"type": "server_data", "data": {"fps": server_fps}}));
            socket.send(JSON.stringify({"type": "world", "data": Array.from(nodes)}));
            console.log(this_username + " joined the game");

            socket.on("message", function(msg) {
                let boffer = Buffer.from(msg);
		        let data = JSON.parse(decoder.write(boffer));
		        message(data.type, data.data, this_player);
            });
            socket.on("close", function() {
                let char_array = Array.from(characters);
                for (let itr in char_array) {
                    let this_character = char_array[itr];
                    if (this_character.id === this_player.id) {
                        socket.close();
                        characters.delete(this_character);
                    }
                }
                console.log(this_player.username + " has disconnected");
            });
        }
    });
});

function do_collisions() {
    characters.forEach(function(this_character) {
        nodes.forEach(function(this_node) {
            Engine.collide(this_node, this_character);
        });
    });
}

function server_tick() {
    do_collisions();

    var char_array = Array.from(characters);
    //send other players
    for (let this_player_num in char_array) {
        let this_player = char_array[this_player_num];
        let other_players = new Array();
        for (let testing_player_num in char_array) {
            let testing_player = char_array[testing_player_num];
            if (this_player.id != testing_player.id) {
                if (this_player.position.distance_to(testing_player.position) <= player_render_distance) {
                    other_players.push({
                        "username": testing_player.username,
                        "position": testing_player.position,
                        "rotation": testing_player.rotation,
                        "health": testing_player.health,
                        "variant": testing_player.variant,
                        "id": testing_player.id
                    });
                }
            }
        }
        this_player.socket.send(JSON.stringify({"type": "other_players", "data": other_players}));
    }
}

setInterval(server_tick, 1000 / server_fps);

function random_rot() {
    let rot = Math.floor(Math.random() * 360);
    let rot_rad = rot * (Math.PI/180);
    return rot_rad;
}
function random_pos() {
    return new Engine.vector((Math.random() * 10000)-5000, (Math.random() * 10000)-5000);
}

function create_boulder(position, rotation) {
    nodes.add(new Engine.node(position, rotation, game_data.world.biome.forest.boulder.radius, game_data.world.biome.forest.boulder.size, "boulder"));
}
function create_tree(position, rotation) {
    nodes.add(new Engine.node(position, rotation, game_data.world.biome.forest.tree.radius, game_data.world.biome.forest.tree.size, "tree"));
}

function generate_world() {
        for (let i=0; i<100; i++) {
        create_tree(random_pos(), random_rot());
        create_boulder(random_pos(), random_rot());
    }
}

generate_world();