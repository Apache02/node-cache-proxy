const http	= require('http');
const net	= require('net');
const url	= require('url');
const fs	= require('fs');
const path	= require('path');
const shell	= require('shelljs');
const zlib	= require("zlib");

const rulesCacheOnly = [
];
const rulesCacheSkip = [
];


var server = http.createServer(function(request, response) {
	console.log(request.method, request.url);
	
	var ph = url.parse(request.url);
	
	
	var options = {
		port		: ph.port,
		hostname	: ph.hostname,
		method		: request.method,
		path		: ph.path,
		headers		: request.headers
	};
	
//	console.log('> ', ph.path);
	
	var filePath = '{hostname}/{path}'
		.replace('{hostname}', ph.hostname)
		.replace('{path}', ph.pathname);
	if ( ph.query ) {
		filePath += '.' + ph.query;
	}
	if ( filePath.substr(-1) == '/' ) {
		filePath += 'index.html';
	}
	filePath = filePath.replace(/\/\/+/g, '/');
	filePath = 'cache/' + filePath;
	filePath = decodeURI(filePath);
	filePath.replace(/[^\w\d\/\._-]/g, '_');
	
//	console.log('> ', filePath);
	shell.mkdir('-p', path.dirname(filePath));
	if ( fs.existsSync(filePath) ) {
		// from cache
	}
	
	var proxyRequest = http.request(options);
	proxyRequest.on('response', function(proxyResponse) {
	
		var file	= false;
		var out		= false;
		if ( request.method == 'GET' && proxyResponse.statusCode == 200 ) {
			file = fs.createWriteStream(filePath, {
				defaultEncoding: 'binary',
			});
			out = file;
			if ( proxyResponse.headers['content-encoding'] == 'gzip' ) {
				// unzip
//				console.log("gunzip");
				var gunzip = zlib.createGunzip();
				gunzip.pipe(out);
				out = gunzip;
			}
		}
		
		proxyResponse.on('data', function(chunk) {
			response.write(chunk, 'binary');
			if ( out ) {
				out.write(chunk);
			}
		});
		proxyResponse.on('end', function() {
			response.end();
			if ( out ) {
				out.end();
			}
		});
		response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
	});
	
	request.on('data', function(chunk) {
		proxyRequest.write(chunk, 'binary');
	});
	
	request.on('end', function() {
		proxyRequest.end();
	});
	
}).on('connect', function (request, socketRequest, head) {
	console.log(request.url);
	
	var ph = url.parse('http://' + request.url);
	var socket = net.connect(ph.port, ph.hostname, function() {
		socket.write(head);
		// Сказать клиенту, что соединение установлено
		socketRequest.write("HTTP/" + request.httpVersion + " 200 Connection established\r\n\r\n");
	});
	// Туннелирование к хосту
	socket.on('data', function(chunk) {
		socketRequest.write(chunk);
	});
	socket.on('end', function() {
		socketRequest.end();
	});
	socket.on('error', function() {
		// Сказать клиенту, что произошла ошибка
		socketRequest.write("HTTP/" + request.httpVersion + " 500 Connection error\r\n\r\n");
		socketRequest.end();
	});
	// Туннелирование к клиенту
	socketRequest.on('data', function(chunk) {
		socket.write(chunk);
	});
	socketRequest.on('end', function() {
		socket.end();
	});
	socketRequest.on('error', function() {
		socket.end();
	});
	
}).listen(8080);

