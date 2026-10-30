import { isoCBOR } from "@simplewebauthn/server/helpers";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

const userPresent = 0x01;
const userVerified = 0x04;
const attestedCredentialData = 0x40;

/**
 * A software passkey (ES256, "none" attestation) that answers the server's WebAuthn options the way a
 * browser's `navigator.credentials` would, so the server tests run real registrations and sign-ins.
 */
export class TestPasskey {
  readonly id = randomBytes(16).toString("base64url");
  private readonly keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  private userHandle = "";
  private counter = 0;

  constructor(
    private readonly origin = "http://localhost:3000",
    private readonly rpID = "localhost",
  ) {}

  /** Answers `navigator.credentials.create()`. */
  register(options: { challenge: string; user: { id: string } }) {
    this.userHandle = options.user.id;
    const jwk = this.keys.publicKey.export({ format: "jwk" });
    const publicKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, bytes(Buffer.from(jwk.x!, "base64url"))],
        [-3, bytes(Buffer.from(jwk.y!, "base64url"))],
      ]),
    );
    const credentialId = Buffer.from(this.id, "base64url");
    const length = Buffer.alloc(2);
    length.writeUInt16BE(credentialId.length);
    const authData = this.authenticatorData(
      userPresent | userVerified | attestedCredentialData,
      Buffer.concat([Buffer.alloc(16), length, credentialId, publicKey]),
    );
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", bytes(authData)],
      ]) as Parameters<typeof isoCBOR.encode>[0],
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: this.clientData("webauthn.create", options.challenge).toString("base64url"),
        attestationObject: Buffer.from(attestationObject).toString("base64url"),
        transports: ["internal"],
      },
      clientExtensionResults: {},
    };
  }

  /** Answers `navigator.credentials.get()`. */
  signIn(options: { challenge: string }, { origin = this.origin } = {}) {
    this.counter += 1;
    const authData = this.authenticatorData(userPresent | userVerified);
    const clientData = this.clientData("webauthn.get", options.challenge, origin);
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientData)]), this.keys.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: clientData.toString("base64url"),
        authenticatorData: authData.toString("base64url"),
        signature: signature.toString("base64url"),
        userHandle: this.userHandle,
      },
      clientExtensionResults: {},
    };
  }

  private authenticatorData(flags: number, attested = Buffer.alloc(0)) {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    return Buffer.concat([sha256(Buffer.from(this.rpID)), Buffer.from([flags]), counter, attested]);
  }

  private clientData(type: string, challenge: string, origin = this.origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }
}

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest();
}

function bytes(buffer: Buffer) {
  return new Uint8Array(buffer);
}
