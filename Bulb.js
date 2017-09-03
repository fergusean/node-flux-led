const events = require('events');
const net = require('net');

class Bulb extends events.EventEmitter {
    constructor(ip, port) {
        super();

        this.ip = ip;
        this.port = port || 5577;
        this.id = null;
        this.model = null;

        this._inBuffer = Buffer.alloc(1024);
        this._inBufferLen = 0;
        this._handlers = [];

        this._socket = null;

        this.isOn = null;
        this.mode = null;
        this.color = null;
    }

    connect(cb) {
        this._socket = net.connect(this.port, this.ip);
        this._socket.on('connect', this._handleSocketConnect.bind(this));
        this._socket.on('data', this._handleSocketData.bind(this));
        cb && this.on('connected', cb);
    }

    refreshState(cb) {
        if (!this._socket)
            return;

        this._writeBytes([ 0x81, 0x8a, 0x8b ]);
        this._getResponse(14, response => {
            let powerState = response[2];
            let patternCode = response[3];
            let warmWhiteLevel = response[9];

            this.isOn = null;
            if (powerState == 0x23)
                this.isOn = true;
            else if (powerState == 0x24)
                this.isOn = false;

            this.mode = null;
            if (patternCode == 0x61 || patternCode == 0x62)
                this.mode = warmWhiteLevel != 0 ? 'warmWhite' : 'color';

            if (this.mode == 'color')
                this.color = { r: response[6], g: response[7], b: response[8] };

            this.emit('stateUpdated');
            cb && cb();
        });
    }

    turnOn() {
        if (!this._socket)
            return;

        this._writeBytes([ 0x71, 0x23, 0x0f ]);
        this._getResponse(1, response => {
            this.isOn = true;
        });
    }

    turnOff() {
        if (!this._socket)
            return;

        this._writeBytes([ 0x71, 0x24, 0x0f ]);
        this._getResponse(1, response => {
            this.isOn = false;
        });
    }

    setRgb(r, g, b) {
        if (!this._socket)
            return;

        this._writeBytes([ 0x31, r, g, b, 0x00, 0xf0, 0x0f ]);
        this._getResponse(1, response => {
            this.color = { r, g, b };
        });
    }

    _handleSocketConnect() {
        this.emit('connected');
        this.refreshState();
    }

    _handleSocketData(data) {
        data.copy(this._inBuffer, this._inBufferLen);
        this._inBufferLen += data.length;
        this._processHandlers();
    }

    _writeBytes(bytes) {
        let sum = 0;
        for (let index = 0; index < bytes.length; index++)
            sum += bytes[index];
        bytes.push(sum & 0xff);
        this._socket.write(Buffer.from(bytes));
    }

    _getResponse(length, cb) {
        this._handlers.push({ len: length, handler: cb });
    }

    _processHandlers() {
        if (this._handlers.length == 0)
            return;
        if (this._inBufferLen < this._handlers[0].len)
            return;

        let handler = this._handlers.shift();

        let data = Buffer.alloc(handler.len);
        this._inBuffer.copy(data, 0, 0, handler.len);
        handler.handler(data);

        let remainingLen = this._inBufferLen - handler.len;
        if (remainingLen)
            this._inBuffer.copy(this._inBuffer, 0, handler.length, this._inBufferLen);

        this._inBufferLen = remainingLen;
    }
}

module.exports = Bulb;