//imports built in

//inports 3rd party

//imports custom
const Room = require("../models/room-model");
const Player = require("../models/player-model");
const validation = require("../utils/validation-util");
const sessionUtil = require("../utils/sessions-util");

//environment variable: application domain
let appDomain = "http://localhost:3000";
if (process.env.APP_DOMAIN) {
  appDomain = process.env.APP_DOMAIN;
}

//associate the client as a player number to a new game room
async function joinRandomRoom(req, res, next) {
  //init response data
  let responseData = {};
  //validate user input
  if (!validation.isUserInputValid(req.body)) {
    responseData.message = "Please choose a name between 3 and 15 characters";
    responseData.inputNotValid = true;
    res.json(responseData);
    return;
  }

  const playerName = req.body.name.trim();

  //check if a room is already assigned to the client
  const sessionGameData = req.session.gameData;
  let roomId;
  if (sessionGameData) {
    roomId = sessionGameData.roomId;
  } else {
    roomId = null;
  }

  //look for an existing available game room
  let availableRoom;
  let playerNumber;
  let symbol;
  let player;
  try {
    availableRoom = await Room.findAvailableAndBlock(roomId);
  } catch (error) {
    next(error);
    return;
  }

  //if no available room was found, create a new one
  if (!availableRoom) {
    const newRoom = Room.createEmpty(false);

    //find a player number and symbol for the client
    playerNumber = newRoom.getAvailablePlayerSlot(); //default = 1 in an empty room
    symbol = newRoom.getAvailableGameSymbol(); //default = X in an empty room

    //create a player with the user input data and save it inside the room
    player = new Player(playerName, symbol, playerNumber, true, false);
    newRoom.addPlayer(player);

    //save the new created room in the DB
    let newRoomId;
    try {
      newRoomId = await newRoom.save();
    } catch (error) {
      next(error);
      return;
    }

    //update room object
    newRoom.roomId = newRoomId.toString();

    //map the client to the saved room by its session
    sessionUtil.saveGameSession(req, {
      roomId: newRoom.roomId,
      playerNumber: playerNumber,
    });

    //block the room the client was already assigned to, so that no other players
    //will be able to join this room even if it still results available
    if (roomId) {
      Room.blockById(roomId); //this will room update query (async process)
    }

    //set and send response data
    responseData.players = newRoom.players;
    responseData.gameStatus = newRoom.gameStatus;
    responseData.playerNumber = playerNumber;
    responseData.isYourTurn = true;
    res.json(responseData);
    return;
  }

  //check if both player slots are availabe in the room found
  const areBothPlayerStolsAvailable =
    availableRoom.isPlayerSlotAvailable(1) &&
    availableRoom.isPlayerSlotAvailable(2);

  //check if client is first player to join the found room
  let hasPlayerTurn;
  if (areBothPlayerStolsAvailable) {
    //no other player was found in this available room
    hasPlayerTurn = true;
  } else {
    if (availableRoom.gameStatus.getCurrentTurn()) {
      //another player was found which already did his move
      hasPlayerTurn = true;
    } else {
      //another player was found which did not do his move yet
      hasPlayerTurn = false;
    }
  }

  //connect the client to the room room with an available player stol (player number) 1 or 2
  playerNumber = availableRoom.getAvailablePlayerSlot();
  symbol = availableRoom.getAvailableGameSymbol();

  //create a player with the user input data and save it inside the room
  player = new Player(
    playerName,
    symbol,
    playerNumber,
    hasPlayerTurn,
    false
  );
  availableRoom.addPlayer(player);

  //un-block the room
  availableRoom.blocked = false;

  //update the room in the DB with the new values
  try {
    await availableRoom.save();
  } catch (error) {
    next(error);
    return;
  }

  //the room was update successfully in the DB...
  //map the client to the saved room by its session
  sessionUtil.saveGameSession(req, {
    roomId: availableRoom.roomId,
    playerNumber: playerNumber,
  });

  //block the room the client was already assigned to, so that no other players
  //will be able to join this room even if it still results available
  if (roomId) {
    Room.blockById(roomId); //this will room update query (async process)
  }

  //set and send response data
  responseData.players = availableRoom.players;
  responseData.gameStatus = availableRoom.gameStatus;
  responseData.playerNumber = playerNumber;
  responseData.isYourTurn = hasPlayerTurn;
  res.json(responseData);
  return;
}

async function createAndJoinPrivateRoom(req, res, next) {
  //init response data
  let responseData = {};
  
  //validate user input
  if (!validation.isUserInputValid(req.body)) {
    responseData.message = "Please choose a name between 3 and 15 characters";
    responseData.inputNotValid = true;
    res.json(responseData);
    return;
  }

  const playerName = req.body.name.trim();

  // Create a new private room
  const newRoom = Room.createEmpty(true); // private room

  // Find a player number and symbol for the client
  const playerNumber = newRoom.getAvailablePlayerSlot(); // default = 1 in an empty room
  const symbol = newRoom.getAvailableGameSymbol(); // default = X in an empty room

  // Create a player with the user input data and save it inside the room
  const player = new Player(playerName, symbol, playerNumber, true, false);
  newRoom.addPlayer(player);

  // Save the newly created room in the DB
  let newRoomId;
  try {
    newRoomId = await newRoom.save();
  } catch (error) {
    next(error);
    return;
  }

  // Update room object
  newRoom.roomId = newRoomId.toString();

  // Set and send response data
  responseData.players = newRoom.players;
  responseData.gameStatus = newRoom.gameStatus;
  responseData.playerNumber = playerNumber;
  responseData.isYourTurn = true;
  responseData.invitationUrl = `${appDomain}/game/new/friend/${newRoom.roomId}`;
  res.json(responseData);
  return;
}

//join a private room from a friend invitation
async function joinPrivateRoom(req, res, next) {
  //init response
  let responseData = {};

  //requested room to join
  const newRoomId = req.params.roomId;

  //check if a room is already assigned to the client
  const sessionGameData = req.params.roomId;
  let roomId;
  if (sessionGameData) {
    roomId = sessionGameData.roomId;
  } else {
    roomId = null;
  }

  //validate user input
  if (!validation.isUserInputValid(req.body)) {
    responseData.message =
      "Please choose a valid name with at least 3 characters";
    responseData.inputNotValid = true;
    res.json(responseData);
    return;
  }

  const playerName = req.body.name.trim();

  //check whether the client is allowed to join this private room
  let room;
  try {
    room = await Room.findByIdAndCheckAccessRights(newRoomId, sessionGameData);
  } catch (error) {
    next(error);
    return;
  }

  //find a player number and symbol for the client
  const playerNumber = room.getAvailablePlayerSlot();
  const symbol = room.getAvailableGameSymbol();

  //check whether the other player already made his move and
  //set turn of the client accordingly
  let hasPlayerTurn;
  if (room.gameStatus.getCurrentTurn()) {
    hasPlayerTurn = true;
  } else {
    hasPlayerTurn = false;
  }

  //create a player with the user input data and save it inside the room
  const player = new Player(
    playerName,
    symbol,
    playerNumber,
    hasPlayerTurn,
    false
  );
  room.addPlayer(player);

  //save the new created room in the DB
  try {
    await room.save();
  } catch (error) {
    next(error);
    return;
  }

  //map the client to the saved room by its session
  sessionUtil.saveGameSession(req, {
    roomId: room.roomId,
    playerNumber: playerNumber,
  });

  //block the room the client was already assigned to, so that no other players
  //will be able to join this room even if it still results available
  if (roomId) {
    Room.blockById(roomId); //this will room update query (async process)
  }

  //set and send response data
  responseData.players = room.players;
  responseData.gameStatus = room.gameStatus;
  responseData.playerNumber = playerNumber;
  responseData.isYourTurn = hasPlayerTurn;
  res.json(responseData);
  return;
}

async function createGameSession12(req, res, next) {
  try {
    const { player1Name, player2Name } = req.body;

    // Validate input
    if (!player1Name || !player2Name) {
      return res.status(400).json({ message: "Invalid request payload" });
    }

    // Create a new room
    const gameRoom = Room.createEmpty(true); // Create a private room

    // Add players to the room
    const player1 = new Player(player1Name, "X", 1, true, false);
    const player2 = new Player(player2Name, "O", 2, false, false);
    gameRoom.addPlayer(player1);
    gameRoom.addPlayer(player2);

    // Save the room
    await gameRoom.save();

    // Respond with the game room and player details
    res.status(200).json({
      room: {
        id: gameRoom.roomId,
        gameSessionUuid: gameRoom.gameSessionUuid,
      },
      players: [
        { name: player1.name, symbol: player1.symbol, number: player1.number },
        { name: player2.name, symbol: player2.symbol, number: player2.number },
      ],
    });
  } catch (error) {
    next(error);
  }
}



//export
module.exports = {
  joinRandomRoom: joinRandomRoom,
  createAndJoinPrivateRoom: createAndJoinPrivateRoom,
  joinPrivateRoom: joinPrivateRoom,
  createGameSession12: createGameSession12,
};
