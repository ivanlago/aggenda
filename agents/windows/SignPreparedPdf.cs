using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;

// Manual pilot. Never opens a listening port, uploads a PFX, or accepts browser commands.
internal static class SignPreparedPdf
{
    const int Capacity = 65536;
    [STAThread]
    static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        try
        {
            if (args.Length != 1) throw new Exception("Abra o agente passando um PDF preparado pelo Aggenda.");
            string path = Path.GetFullPath(args[0]);
            if (new FileInfo(path).Length > 10 * 1024 * 1024) throw new Exception("PDF excede 10 MiB.");
            byte[] pdf = File.ReadAllBytes(path);
            string text = Encoding.GetEncoding(28591).GetString(pdf);
            var ranges = Regex.Matches(text, @"/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]");
            if (ranges.Count != 1 || Regex.Matches(text, @"/ByteRange\b").Count != 1)
                throw new Exception("Esperada uma unica assinatura preparada.");
            var r = ranges[0];
            int start = int.Parse(r.Groups[1].Value), length = int.Parse(r.Groups[2].Value);
            int tail = int.Parse(r.Groups[3].Value), rest = int.Parse(r.Groups[4].Value);
            if (start != 0 || length <= 0 || tail <= length || (long)tail + rest != pdf.Length ||
                tail - length != Capacity + 2 || pdf[length] != 60 || pdf[tail - 1] != 62 ||
                !Regex.IsMatch(text.Substring(length + 1, Capacity), @"\A0+\z") ||
                !Regex.IsMatch(text.Substring(Math.Max(0, length - 30), Math.Min(30, length)), @"/Contents\s*$") ||
                !text.Contains("/SubFilter /ETSI.CAdES.detached"))
                throw new Exception("PDF nao preparado ou ja assinado.");
            byte[] content = new byte[length + rest];
            Buffer.BlockCopy(pdf, 0, content, 0, length);
            Buffer.BlockCopy(pdf, tail, content, length, rest);
            string hash;
            using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(pdf)).Replace("-", "").ToLowerInvariant();
            using (var store = new X509Store(StoreName.My, StoreLocation.CurrentUser))
            {
                store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
                var candidates = new X509Certificate2Collection();
                foreach (var certificate in store.Certificates)
                    if (certificate.HasPrivateKey && certificate.NotBefore <= DateTime.Now && certificate.NotAfter > DateTime.Now &&
                        certificate.PublicKey.Oid.Value == "1.2.840.113549.1.1.1") candidates.Add(certificate);
                var selected = X509Certificate2UI.SelectFromCollection(candidates, "Aggenda - piloto local",
                    "Escolha seu certificado pessoal. A chave privada permanece no Windows.", X509SelectionFlag.SingleSelection);
                if (selected.Count != 1) return 2;
                var cert = selected[0];
                using (var chain = new X509Chain())
                {
                    chain.ChainPolicy.RevocationMode = X509RevocationMode.Online;
                    chain.ChainPolicy.RevocationFlag = X509RevocationFlag.ExcludeRoot;
                    chain.ChainPolicy.UrlRetrievalTimeout = TimeSpan.FromSeconds(20);
                    if (!chain.Build(cert)) throw new Exception("O Windows nao confirmou a cadeia e a revogacao do certificado.");
                }
                var consent = MessageBox.Show("Assinar este arquivo?\n\n" + path + "\n\nTitular: " + cert.Subject +
                    "\n\nSHA-256 do PDF preparado:\n" + hash +
                    "\n\nPiloto: confira o conteudo do PDF antes de confirmar. A validacao ICP-Brasil no servidor ainda e obrigatoria.",
                    "Aggenda - autorizar assinatura", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
                if (consent != DialogResult.Yes) return 2;
                var cms = new SignedCms(new ContentInfo(content), true);
                var signer = new CmsSigner(SubjectIdentifierType.IssuerAndSerialNumber, cert);
                signer.DigestAlgorithm = new Oid("2.16.840.1.101.3.4.2.1");
                signer.IncludeOption = X509IncludeOption.ExcludeRoot;
                // ESS signingCertificateV2, SHA-256 is the default hash algorithm.
                byte[] certHash;
                using (var sha = SHA256.Create()) certHash = sha.ComputeHash(cert.RawData);
                var ess = new byte[] { 0x30, 0x26, 0x30, 0x24, 0x30, 0x22, 0x04, 0x20 }.Concat(certHash).ToArray();
                signer.SignedAttributes.Add(new AsnEncodedData(new Oid("1.2.840.113549.1.9.16.2.47"), ess));
                cms.ComputeSignature(signer, false);
                cms.CheckSignature(true);
                byte[] encoded = cms.Encode();
                if (encoded.Length * 2 > Capacity) throw new Exception("CMS excede a reserva do PDF.");
                // CreateNew prevents silent overwrite of an earlier result.
                string output = path + ".p7s";
                using (var file = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    file.Write(encoded, 0, encoded.Length);
                MessageBox.Show("CMS salvo em:\n" + output + "\n\nAinda deve ser incorporado e validado pelo Aggenda.", "Aggenda");
            }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "Aggenda - assinatura nao concluida", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
