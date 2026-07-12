import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    username: {
      type: String,
      required: true,
      trim: true
    },
    district: {
      type: String,
      default: "",
      trim: true
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ["agent", "admin"],
      default: "agent",
      index: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.updatedAt;
        return ret;
      }
    }
  }
);

const User = mongoose.model("users", userSchema);
export default User;
