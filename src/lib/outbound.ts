import net from "node:net";

/**
 * Node tries a host's IPv6 and IPv4 addresses in turn and, by default, gives each attempt only 250 ms
 * to connect. From a host without IPv6, or one far from the server (US to Europe), that is too short:
 * every attempt is abandoned and fetch() rejects with "fetch failed". Give each attempt a realistic window.
 */
net.setDefaultAutoSelectFamilyAttemptTimeout?.(5000);
