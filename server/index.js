'use strict';

const os = require('os'); // operating system lib
const nss = require('node-static'); // node-static-server lib
const http = require('http'); // node http lib
const socketIO = require('socket.io'); // socket.io lib

const fs = new (nss.Server)('./server/template'); // fs here is not file system :( but file server :) anyway

// create an server
const app = http.createServer((req, res) => {
    fs.serve(req, res);
}).listen(8080);

const io = socketIO.listen(app); // load socket.io listening to http server created before

// when io found client connected
io.sockets.on('connection', function (socket) {

    // convenience func to notify server messages to the client
    function notify() {
        let array = ['[[[Server Notifications]]]:']; // init message list
        array.push.apply(array, arguments); // push args to message list
        socket.emit('notify', array); // emit messages
    }

    // got message then resend to other client
    socket.on('message', function (message) {
        notify('Client said:', message);
        socket.broadcast.emit('message', message); // broadcast the message to other clients, but here maximum client nums is 2
    });

    socket.on('create or join', function (room) {
        notify('Received request to create or join room: ' + room);
        let clientsInRoom = io.sockets.adapter.rooms[room]; // found members in room now
        let nums = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        notify(`Room ${room} now has ${nums} client(s)`);

        // if no members in current room
        if (nums === 0) {
            socket.join(room); // create new room
            notify(`Client ID ${socket.id} created room ${room}`);
            socket.emit('created', room, socket.id); // emit signal to client that room created successfully
        } else if (nums === 1) {
            notify(`Client ID ${socket.id} joined room ${room}`);
            io.sockets.in(room).emit('join', room); // emit join signal to the peer now in the room
            socket.join(room); // join to the room
            socket.emit('joined', room, socket.id); // emit signal to client that room joined successfully
            io.sockets.in(room).emit('ready'); // when both of two clients are here in room now, emit ready to both of them
        } else { // max two clients
            socket.emit('full', room);
        }
    });

    socket.on('ipaddr', function () {
        const ifaces = os.networkInterfaces(); // get network interfaces
        for (let dev in ifaces) {
            ifaces[dev].forEach(function (details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address); // emit server ip address to socket
                }
            })
        }
    });

    // bye handler
    socket.on('bye', function () {
        console.log('received bye from client');
        notify('bye~');
    });

});

