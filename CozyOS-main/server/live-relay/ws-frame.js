/**
 * server/live-relay/ws-frame.js
 * CozyOS — Live Distribution — Minimal RFC6455 WebSocket Server Framing
 * Milestone: R040 Phase 3
 *
 * REAL SCOPE DISCLOSURE
 *   Hand-rolled because this sandbox has no network access to install
 *   the `ws` npm package. This implements the real RFC6455 handshake
 *   (Sec-WebSocket-Accept via SHA1) and real frame encode/decode —
 *   not a mock. It intentionally supports what a JSON-signaling
 *   protocol needs: text frames, close, ping/pong, payloads up to the
 *   64-bit extended length header, client-to-server masking
 *   (mandatory per spec) and server-to-client unmasked frames.
 *   It does NOT implement permessage-deflate or fragmented messages
 *   (every JSON message here is sent as a single FIN frame) — both are
 *   real, disclosed omissions, not silently-broken features.
 */
'use strict';

const crypto = require('crypto');

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKeyFor(clientKey) {
    return crypto.createHash('sha1').update(clientKey + WS_MAGIC).digest('base64');
}

/** Builds the raw HTTP response bytes to complete the WS handshake. */
function buildHandshakeResponse(clientKey) {
    const accept = acceptKeyFor(clientKey);
    return (
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
}

/** Encodes a single unmasked server->client text frame. */
function encodeText(str) {
    const payload = Buffer.from(str, 'utf8');
    return encodeFrame(0x1, payload);
}

function encodeClose(code = 1000, reason = '') {
    const reasonBuf = Buffer.from(reason, 'utf8');
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    return encodeFrame(0x8, payload);
}

function encodePong(payload = Buffer.alloc(0)) {
    return encodeFrame(0xa, payload);
}

function encodeFrame(opcode, payload) {
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x80 | opcode; // FIN + opcode
        header[1] = len; // no mask bit set (server->client is unmasked)
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payload]);
}

/**
 * FrameDecoder — stateful, streaming. Feed raw socket bytes via push();
 * emits complete decoded frames via the onFrame callback. Handles
 * client->server masked frames (masking is mandatory for clients per
 * RFC6455 section 5.1; a frame without the mask bit is rejected).
 */
class FrameDecoder {
    constructor(onFrame, onError) {
        this._buf = Buffer.alloc(0);
        this._onFrame = onFrame;
        this._onError = onError || (() => {});
    }

    push(chunk) {
        this._buf = this._buf.length ? Buffer.concat([this._buf, chunk]) : chunk;
        this._drain();
    }

    _drain() {
        // Loop: try to decode as many complete frames as are buffered.
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (this._buf.length < 2) return;
            const b0 = this._buf[0];
            const b1 = this._buf[1];
            const fin = (b0 & 0x80) !== 0;
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            let len = b1 & 0x7f;
            let offset = 2;

            if (!masked) {
                this._onError(new Error('[ws-frame] Client frame missing required mask bit (RFC6455 5.1).'));
                this._buf = Buffer.alloc(0);
                return;
            }

            if (len === 126) {
                if (this._buf.length < offset + 2) return;
                len = this._buf.readUInt16BE(offset);
                offset += 2;
            } else if (len === 127) {
                if (this._buf.length < offset + 8) return;
                len = Number(this._buf.readBigUInt64BE(offset));
                offset += 8;
            }

            if (this._buf.length < offset + 4) return; // mask key
            const maskKey = this._buf.subarray(offset, offset + 4);
            offset += 4;

            if (this._buf.length < offset + len) return; // full payload not yet buffered

            const maskedPayload = this._buf.subarray(offset, offset + len);
            const payload = Buffer.alloc(len);
            for (let i = 0; i < len; i++) payload[i] = maskedPayload[i] ^ maskKey[i % 4];

            this._buf = this._buf.subarray(offset + len);

            this._onFrame({ fin, opcode, payload });
            if (this._buf.length === 0) return;
        }
    }
}

module.exports = {
    acceptKeyFor,
    buildHandshakeResponse,
    encodeText,
    encodeClose,
    encodePong,
    encodeFrame,
    FrameDecoder,
    OPCODE: { CONTINUATION: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa },
};
