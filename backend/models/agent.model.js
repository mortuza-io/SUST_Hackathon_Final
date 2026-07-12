import mongoose, { mongo } from "mongoose";

const agentSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    agentName: {
        type: String,
        required: true
    },
    district: String,
    cash: Number,
    bkash_balance: Number,
    nagad_balance: Number,
    rocket_balance: Number,
    transactions_last_hour: Number,
    liquidityPressure: String,
    transactionHistory: []

},
{
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.updatedAt;
        return ret;
      }
    }
  })

const Agent = mongoose.model("agents",agentSchema);

export default Agent;