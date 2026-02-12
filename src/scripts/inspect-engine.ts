import 'dotenv/config';
import { deriverseEngine } from '../config/deriverse';

async function deepInspectEngine() {
  const wallet = "aDRu8JtwmXfiyAiRCp5qk2ugJaecr7XUzSw9MmPFFQF";
  
  console.log("🕵️  COMMENCING TOTAL ENGINE INSPECTION...");

  try {
    // 1. Basic Setup - bypass address type issues
    await (deriverseEngine as any).setSigner(wallet as any);
    
    // 2. Log the Top-Level Keys (Public & Private)
    console.log("\n--- [ TOP LEVEL PROPERTIES ] ---");
    const allProps = Object.getOwnPropertyNames(deriverseEngine);
    const prototypeProps = Object.getOwnPropertyNames(Object.getPrototypeOf(deriverseEngine));
    
    console.log("Instance Properties:", allProps);
    console.log("Available Methods (Prototype):", prototypeProps);

    // 3. Deep Dump of the Internal State
    // We use depth: 2 to see the objects inside the engine without getting lost in circular references.
    console.log("\n--- [ FULL ENGINE STATE DUMP ] ---");
    console.dir(deriverseEngine, { 
        showHidden: true, 
        depth: 2, 
        colors: true 
    });

    // 4. Specifically look at the Client Data structure if it was loaded
    console.log("\n--- [ CHECKING FOR CACHED CLIENT DATA ] ---");
    const internalData = (deriverseEngine as any)._clientPrimaryAccount;
    console.log("Current _clientPrimaryAccount:", internalData ? internalData.toString() : "NULL");

  } catch (err: any) {
    console.error("❌ Inspection crashed:", err.message);
  }
}

deepInspectEngine();