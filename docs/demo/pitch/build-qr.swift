import Foundation
import CoreImage
import AppKit
import Vision
let url = "https://first-10-three.vercel.app/founding-partners"
let output = CommandLine.arguments[1]
let filter = CIFilter(name: "CIQRCodeGenerator", parameters: ["inputMessage": url.data(using: .utf8)!, "inputCorrectionLevel": "M"])!
let qr = filter.outputImage!.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
let border: CGFloat = 48
let frame = CGRect(x: 0, y: 0, width: qr.extent.width + border * 2, height: qr.extent.height + border * 2)
let placed = qr.transformed(by: CGAffineTransform(translationX: border, y: border))
let white = CIImage(color: CIColor.white).cropped(to: frame)
let final = placed.composited(over: white)
let cg = CIContext().createCGImage(final, from: frame)!
let rep = NSBitmapImageRep(cgImage: cg)
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
let decoded = request.results?.first?.payloadStringValue
assert(decoded == url, "QR decode mismatch")
print("Verified QR: \(decoded!)")
