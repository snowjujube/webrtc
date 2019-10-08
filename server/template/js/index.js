'use strict';

// TURN server deployed before
const ICE_SERVER_CONFIG = {
    // 'iceServers': [
    //     {
    //         'urls': 'stun:118.178.181.100:3478',
    //     },
    //     {
    //         'urls': 'turn:118.178.181.100:3478',
    //         'username': 'neo',
    //         'credential': 'tape'
    //     },
    // ]
    'iceServers': [{
        'urls': 'turn:118.178.181.100:3478',
        'username': 'neo',
        'credential': 'tape'
    }]
};

// SDP protocol constraints
const SDP_CONSTRAINTS = {
    offerToReceiveVideo: true,
    offerToReceiveAudio: true,
};

// define ROOM as a const now
const ROOM = 'neotape';

// Some flags defined here
let isChannelReady = false;
let isInitiator = false;
let isStarted = false;
let localStream;
let pc;
let remoteStream;
let turnReady;


// connect to the server
const socket = io('http://neotape.live:8080');

// try to join room 'neotape'
if (ROOM !== '') {
    socket.emit('create or join', ROOM);
    console.log(`Attempted to create or join room: ${ROOM}`);
}

// after room created
socket.on('created', function (room) {
    console.log(`Created room: ${room}`);
    isInitiator = true; // the client that created room is the initiator
});

// room full handler
socket.on('full', function (room) {
    console.log(`Room ${room} is full`);
});

// when another client join to the room
socket.on('join', function (room) {
    console.log(
        `Another peer made a request to join room: ${room} \n`,
        `This peer is the initiator of room: ${room}`
    );
    isChannelReady = true;
});

// when both of the clients are in the room
socket.on('joined', function (room) {
    console.log(`joined: ${room}`);
    isChannelReady = true;
});

// notify from the server
socket.on('notify', function (array) {
    console.log.apply(console, array); // log them all
});

////////////////////////////////////////////////

function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

// This client receives a message
socket.on('message', function (message) {
    console.log('Client received message:', message);
    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!isInitiator && !isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true
})
    .then(gotStream)
    .catch(function (e) {
        alert('getUserMedia() error: ' + e.name);
    });

function gotStream(stream) {
    console.log('Adding local stream.');
    localStream = stream;
    localVideo.srcObject = stream;
    sendMessage('got user media');
    if (isInitiator) {
        maybeStart();
    }
}

var constraints = {
    video: true
};

console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
    // requestTurn(
    //     'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
    // );
}

function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
        console.log('>>>>>> creating peer connection');
        createPeerConnection();
        pc.addStream(localStream);
        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (isInitiator) {
            doCall();
        }
    }
}

window.onbeforeunload = function () {
    sendMessage('bye');
};

/////////////////////////////////////////////////////////

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
}

function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
}

function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
    var turnExists = false;
    for (var i in ICE_SERVER_CONFIG.iceServers) {
        if (ICE_SERVER_CONFIG.iceServers[i].urls.substr(0, 5) === 'turn:') {
            turnExists = true;
            turnReady = true;
            break;
        }
    }
    if (!turnExists) {
        console.log('Getting TURN server from ', turnURL);
        // No TURN server. Get one from computeengineondemand.appspot.com:
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                var turnServer = JSON.parse(xhr.responseText);
                console.log('Got TURN server: ', turnServer);
                pcConfig.iceServers.push({
                    'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                    'credential': turnServer.password
                });
                turnReady = true;
            }
        };
        xhr.open('GET', turnURL, true);
        xhr.send();
    }
}


function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = false;
}

function stop() {
    isStarted = false;
    pc.close();
    pc = null;
}











