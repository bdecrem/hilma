import Foundation

/// The card rules, on the phone, so a tap or a Check reacts at once. Mirrors
/// `src/lib/dolly/language.ts` (`normalizeAnswer`, `answerMatches`,
/// `nativeMatches`) exactly: the server still grades and records every
/// answer; this only decides what the card shows in the meantime.
enum Grader {
    /// Lowercase, accents off (ñ → n, ü → u, as the server's NFD strip does).
    private static func fold(_ s: String) -> String {
        s.lowercased().folding(options: .diacriticInsensitive, locale: nil)
    }

    private static func collapse(_ s: String) -> String {
        s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }

    /// Spanish: letters and spaces only, a leading article dropped.
    static func normalizeSpanish(_ v: String) -> String {
        let letters = fold(v).replacingOccurrences(of: "[^a-z\\s]", with: "", options: .regularExpression)
        return collapse(letters).replacingOccurrences(of: "^(el|la|los|las|un|una) ", with: "", options: .regularExpression)
    }

    /// Mandarin: characters without spaces or punctuation; pinyin as bare letters.
    static func normalizeMandarin(_ v: String) -> String {
        let t = v.trimmingCharacters(in: .whitespaces)
        if t.unicodeScalars.contains(where: { (0x3400...0x9FFF).contains($0.value) }) {
            return String(t.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) && !CharacterSet.punctuationCharacters.contains($0) })
        }
        return fold(t).replacingOccurrences(of: "[^a-z]", with: "", options: .regularExpression)
    }

    static func normalize(_ lang: String, _ v: String) -> String {
        lang == "zh" ? normalizeMandarin(v) : normalizeSpanish(v)
    }

    /// A typed answer in the language.
    static func matches(lang: String, typed: String, target: String, pinyin: String?) -> Bool {
        let a = normalize(lang, typed)
        if a.isEmpty { return false }
        if a == normalize(lang, target) { return true }
        if lang == "zh", let p = pinyin, a == normalize(lang, p) { return true }
        return false
    }

    /// English: parentheticals out, apostrophes and hyphens gone, other
    /// punctuation a space.
    static func normalizeNative(_ v: String) -> String {
        let s = fold(v)
            .replacingOccurrences(of: "\\([^)]*\\)", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "['’-]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "[^a-z\\s]", with: " ", options: .regularExpression)
        return collapse(s)
    }

    private static func stripLead(_ s: String) -> String {
        s.replacingOccurrences(of: "^(to|the|a|an|i am|im|i) ", with: "", options: .regularExpression)
    }

    /// A typed answer in English: the whole meaning or any one alternative,
    /// a leading "to"/"the"/"a"/"an" optional, spaces optional.
    static func nativeMatches(typed: String, answer: String) -> Bool {
        let a = normalizeNative(typed)
        if a.isEmpty { return false }
        let alts = answer.split(whereSeparator: { $0 == "," || $0 == "/" }).map { normalizeNative(String($0)) }.filter { !$0.isEmpty }
        let tight = { (s: String) in s.replacingOccurrences(of: " ", with: "") }
        for b in [normalizeNative(answer)] + alts {
            if a == b || stripLead(a) == stripLead(b) || tight(a) == tight(b) { return true }
        }
        return false
    }

    /// The card's verdict, as the server will give it.
    static func grade(lang: String, question q: Question, answer: String) -> Bool {
        if q.kind == "pick" { return answer == q.target }
        if q.reversed { return nativeMatches(typed: answer, answer: q.target) }
        return matches(lang: lang, typed: answer, target: q.target, pinyin: q.pinyin)
    }
}
