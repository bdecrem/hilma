import Foundation

/// Loosely typed JSON: opencode's events and messages are read only as far as the apps need them,
/// so an upgrade that adds fields changes nothing here (the web app's conversation.ts does the same).
public enum JSON: Codable, Equatable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSON])
  case object([String: JSON])

  public init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { self = .null }
    else if let b = try? c.decode(Bool.self) { self = .bool(b) }
    else if let n = try? c.decode(Double.self) { self = .number(n) }
    else if let s = try? c.decode(String.self) { self = .string(s) }
    else if let a = try? c.decode([JSON].self) { self = .array(a) }
    else { self = .object(try c.decode([String: JSON].self)) }
  }

  public func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .null: try c.encodeNil()
    case .bool(let b): try c.encode(b)
    case .number(let n): try c.encode(n)
    case .string(let s): try c.encode(s)
    case .array(let a): try c.encode(a)
    case .object(let o): try c.encode(o)
    }
  }

  public subscript(key: String) -> JSON {
    if case .object(let o) = self { return o[key] ?? .null }
    return .null
  }

  public subscript(index: Int) -> JSON {
    if case .array(let a) = self, a.indices.contains(index) { return a[index] }
    return .null
  }

  public var string: String? { if case .string(let s) = self { return s }; return nil }
  public var str: String { string ?? "" }
  public var double: Double? { if case .number(let n) = self { return n }; return nil }
  public var int: Int? { double.map { Int($0) } }
  public var bool: Bool? { if case .bool(let b) = self { return b }; return nil }
  public var array: [JSON] { if case .array(let a) = self { return a }; return [] }
  public var object: [String: JSON] { if case .object(let o) = self { return o }; return [:] }
  public var isNull: Bool { self == .null }

  /// Milliseconds since 1970 as a Date.
  public var date: Date? { double.map { Date(timeIntervalSince1970: $0 / 1000) } }

  public static func parse(_ data: Data) -> JSON? { try? JSONDecoder().decode(JSON.self, from: data) }
  public static func parse(_ text: String) -> JSON? { parse(Data(text.utf8)) }

  public var data: Data { (try? JSONEncoder().encode(self)) ?? Data("null".utf8) }

  /// Pretty text for "Show details".
  public var pretty: String {
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return (try? enc.encode(self)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
  }
}

extension JSON: ExpressibleByStringLiteral, ExpressibleByDictionaryLiteral, ExpressibleByArrayLiteral, ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral {
  public init(stringLiteral value: String) { self = .string(value) }
  public init(dictionaryLiteral elements: (String, JSON)...) { self = .object(Dictionary(uniqueKeysWithValues: elements)) }
  public init(arrayLiteral elements: JSON...) { self = .array(elements) }
  public init(booleanLiteral value: Bool) { self = .bool(value) }
  public init(integerLiteral value: Int) { self = .number(Double(value)) }
}
