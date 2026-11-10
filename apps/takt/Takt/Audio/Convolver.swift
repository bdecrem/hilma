import Accelerate
import AVFoundation

/// Convolution with a long impulse (a hall, a room), one sample in and one out, for the render
/// thread: uniformly partitioned, in the frequency domain (overlap-save; Wefers' UPOLS). The
/// impulse is cut into blocks of `block` frames and each block's spectrum is kept; every
/// `block` input samples the last two blocks are transformed once, and the output block is the
/// sum over the partitions of (the input spectrum from that many blocks ago × the partition's
/// spectrum), transformed back. That costs one block of latency, so the impulse gives up its
/// first `block` frames: an impulse with at least that much predelay (silence before the
/// first reflection) comes out exactly on time. Nothing allocates after init.
final class Convolver {
    /// An impulse's spectra at one block size: read-only, shared by every convolver over it.
    final class Kernel {
        let block: Int
        let partitions: Int
        let re: UnsafeMutablePointer<Float>
        let im: UnsafeMutablePointer<Float>
        /// What the trimmed first block held, as a share of the impulse's energy (should be ~0).
        let trimmed: Double
        /// That first block itself: an impulse with no predelay plays it as a direct FIR beside
        /// the convolver (`AcidRack`'s rumble), so nothing is lost and nothing is late.
        let head: [Float]

        init(impulse: [Float], block: Int) {
            precondition(block > 0 && block & (block - 1) == 0, "the block is a power of two")
            self.block = block
            let head = impulse.prefix(block).reduce(0.0) { $0 + Double($1) * Double($1) }
            let all = impulse.reduce(0.0) { $0 + Double($1) * Double($1) }
            trimmed = all > 0 ? head / all : 0
            self.head = Array(impulse.prefix(block)) + [Float](repeating: 0, count: max(0, block - impulse.count))
            let body = Array(impulse.dropFirst(block))
            partitions = max(1, (body.count + block - 1) / block)
            re = .allocate(capacity: partitions * block)
            im = .allocate(capacity: partitions * block)
            let fft = FFT(block: block)
            var time = [Float](repeating: 0, count: 2 * block)
            for p in 0..<partitions {
                for i in 0..<block {
                    let k = p * block + i
                    time[i] = k < body.count ? body[k] : 0
                    time[block + i] = 0
                }
                time.withUnsafeBufferPointer { fft.forward($0.baseAddress!, re + p * block, im + p * block) }
            }
        }

        private static var cache: [String: Kernel] = [:]

        /// A bundled impulse (`<name>-44.wav` / `<name>-48.wav`, float), one side of it, at the
        /// rate nearest the engine's. Main thread; cached.
        static func bundled(_ name: String, side: Int, sampleRate: Double, block: Int) -> Kernel {
            let file = "\(name)-\(sampleRate < 46000 ? 44 : 48)"
            let key = "\(file)|\(side)|\(block)"
            if let k = cache[key] { return k }
            guard let url = Bundle.main.url(forResource: file, withExtension: "wav") else { fatalError("impulse \(file).wav is not in the bundle") }
            do {
                let f = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
                guard let buf = AVAudioPCMBuffer(pcmFormat: f.processingFormat, frameCapacity: AVAudioFrameCount(f.length)) else { fatalError("impulse \(file): no buffer") }
                try f.read(into: buf)
                let ch = buf.floatChannelData![min(side, Int(f.processingFormat.channelCount) - 1)]
                let k = Kernel(impulse: Array(UnsafeBufferPointer(start: ch, count: Int(buf.frameLength))), block: block)
                cache[key] = k
                return k
            } catch {
                fatalError("impulse \(file): \(error)")
            }
        }
    }

    /// vDSP's real FFT over two blocks, packed: bin 0 holds DC in `re[0]` and Nyquist in `im[0]`.
    struct FFT {
        let block: Int
        let log2n: vDSP_Length
        let setup: FFTSetup

        init(block: Int) {
            self.block = block
            log2n = vDSP_Length((2 * block).trailingZeroBitCount)
            setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!
        }

        func forward(_ time: UnsafePointer<Float>, _ re: UnsafeMutablePointer<Float>, _ im: UnsafeMutablePointer<Float>) {
            var split = DSPSplitComplex(realp: re, imagp: im)
            time.withMemoryRebound(to: DSPComplex.self, capacity: block) { vDSP_ctoz($0, 2, &split, 1, vDSP_Length(block)) }
            vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
        }

        func inverse(_ re: UnsafeMutablePointer<Float>, _ im: UnsafeMutablePointer<Float>, _ time: UnsafeMutablePointer<Float>) {
            var split = DSPSplitComplex(realp: re, imagp: im)
            vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_INVERSE))
            time.withMemoryRebound(to: DSPComplex.self, capacity: block) { vDSP_ztoc(&split, 1, $0, 2, vDSP_Length(block)) }
        }
    }

    private let kernel: Kernel
    private let block: Int
    private let fft: FFT
    /// The spectra of the last `partitions` input blocks, a ring.
    private let xRe: UnsafeMutablePointer<Float>
    private let xIm: UnsafeMutablePointer<Float>
    private var head = 0
    /// The last block and the one filling.
    private let time: UnsafeMutablePointer<Float>
    private let accRe: UnsafeMutablePointer<Float>
    private let accIm: UnsafeMutablePointer<Float>
    private let result: UnsafeMutablePointer<Float>
    private let out: UnsafeMutablePointer<Float>
    private var pos = 0
    /// Forward × forward × inverse, by vDSP's scaling: 2 · 2 · N over two blocks.
    private let scale: Float

    init(_ kernel: Kernel) {
        self.kernel = kernel
        block = kernel.block
        fft = FFT(block: block)
        let n = kernel.partitions * block
        xRe = .allocate(capacity: n)
        xIm = .allocate(capacity: n)
        time = .allocate(capacity: 2 * block)
        accRe = .allocate(capacity: block)
        accIm = .allocate(capacity: block)
        result = .allocate(capacity: 2 * block)
        out = .allocate(capacity: block)
        scale = 1 / Float(4 * 2 * block)
        reset()
    }

    func reset() {
        let n = kernel.partitions * block
        xRe.update(repeating: 0, count: n)
        xIm.update(repeating: 0, count: n)
        time.update(repeating: 0, count: 2 * block)
        out.update(repeating: 0, count: block)
        head = 0
        pos = 0
    }

    /// One sample in, one out (the impulse's first `block` frames are this call's latency).
    @inline(__always) func tick(_ x: Float) -> Float {
        time[block + pos] = x
        let y = out[pos]
        pos += 1
        if pos == block {
            compute()
            pos = 0
        }
        return y
    }

    private func compute() {
        let p = kernel.partitions
        head = (head + 1) % p
        fft.forward(time, xRe + head * block, xIm + head * block)
        vDSP_vclr(accRe, 1, vDSP_Length(block))
        vDSP_vclr(accIm, 1, vDSP_Length(block))
        var dc: Float = 0, nyquist: Float = 0
        var acc = DSPSplitComplex(realp: accRe, imagp: accIm)
        for k in 0..<p {
            let slot = (head - k + p) % p
            var x = DSPSplitComplex(realp: xRe + slot * block, imagp: xIm + slot * block)
            var h = DSPSplitComplex(realp: kernel.re + k * block, imagp: kernel.im + k * block)
            // Packed bin 0 is two real values, not one complex one.
            dc += x.realp[0] * h.realp[0]
            nyquist += x.imagp[0] * h.imagp[0]
            vDSP_zvma(&x, 1, &h, 1, &acc, 1, &acc, 1, vDSP_Length(block))
        }
        accRe[0] = dc
        accIm[0] = nyquist
        fft.inverse(accRe, accIm, result)
        var s = scale
        vDSP_vsmul(result + block, 1, &s, out, 1, vDSP_Length(block))
        // The block just filled becomes the last one.
        time.update(from: time + block, count: block)
    }
}
