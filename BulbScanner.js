const events = require('events');
const dgram = require('dgram');
const Bulb = require('./Bulb');

class BulbScanner extends events.EventEmitter {
    constructor() {
        super();

        this.port = 48899;
        this.isScanning = false;

        this._discoveryMsgBuf = Buffer.from('HF-A11ASSISTHREAD');
        this._discoveredBulbs = null;
    }

    scan(timeout) {
        if (this.isScanning)
            return;

        this.isScanning = true;
        this._discoveredBulbs = [];

        this._socket = dgram.createSocket('udp4');
        this._socket.on('message', this._handleSocketMessage.bind(this));
        
        this._socket.bind(this.port, () => {
            this._socket.setBroadcast(true);
        });

        this._sendDiscoveryPacketInterval = setInterval(this._sendDiscoveryPacket.bind(this), 1000);
        this._sendDiscoveryPacket();

        timeout && setTimeout(this.stopScanning.bind(this), timeout * 1000);

        this.emit('scanning');
    }

    stopScanning() {
        if (!this.isScanning)
            return;

        this.isScanning = false;

        this._socket.close();
        this._socket = null;

        this.emit('stopped');
    }

    _sendDiscoveryPacket() {
        if (!this.isScanning)
            return;

        this._socket.send(this._discoveryMsgBuf, this.port, '255.255.255.255');
    }

    _handleSocketMessage(msg, rinfo) {
        if (msg.equals(this._discoveryMsgBuf))
            return;

        if (this._discoveredBulbs.indexOf(rinfo.address) >= 0)
            return;

        let msgStr = String(msg);
        let matches = msgStr.match(/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+),(.+),(.+)$/);
        if (!matches)
            return;

        this._discoveredBulbs.push(rinfo.address);

        let bulb = new Bulb(rinfo.address);
        bulb.id = matches[2];
        bulb.model = matches[3];

        this.emit('bulb', bulb);
    }
}

module.exports = BulbScanner;