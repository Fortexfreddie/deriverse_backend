import 'dotenv/config';
import { rpc, deriverseEngine } from '../config/deriverse';
import { 
    pipe, createTransactionMessage, setTransactionMessageLifetimeUsingBlockhash, 
    setTransactionMessageFeePayerSigner, appendTransactionMessageInstruction, 
    signTransactionMessageWithSigners, getSignatureFromTransaction, createKeyPairSignerFromBytes
} from "@solana/kit";
import { readFileSync } from "fs";

async function initializeAccount() {
    const keypairFile = readFileSync(process.env.KEYPAIR_FILENAME!);
    const keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));
    const signer = await createKeyPairSignerFromBytes(keypairBytes);

    console.log("🚀 Attempting Direct Seat Purchase for:", signer.address);
    
    try {
        // We SKIP updateRoot and updateCommunity because they are causing the RPC NULL error.
        await deriverseEngine.setSigner(signer.address);

        console.log("🛠️  Building Seat Instruction...");
        
        // This method is often more 'stable' for new accounts
        const seatIx = await (deriverseEngine as any).perpBuySeatInstruction();

        const { value: blockhash } = await rpc.getLatestBlockhash().send();

        const transactionMessage = pipe(
            createTransactionMessage({ version: 0 }),
            tx => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
            tx => setTransactionMessageFeePayerSigner(signer, tx),
            tx => appendTransactionMessageInstruction(seatIx, tx)
        );

        const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
        const signature = getSignatureFromTransaction(signedTransaction);

        console.log("✅ SUCCESS! Account Seat Purchased.");
        console.log("⏳ Signature:", signature);

    } catch (error: any) {
        console.error("❌ Final Boss Error:", error.message);
        console.log("💡 If this fails with 'get', the Engine state is still empty.");
    }
}

initializeAccount().catch(console.error);