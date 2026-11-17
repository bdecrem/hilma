import ElevenLabs

// OlaKit has its own Conversation (opencode's), and the module ElevenLabs is shadowed by an enum of
// the same name, so the SDK's type is named here, in a file that imports only the SDK.
typealias ElevenConversation = Conversation
