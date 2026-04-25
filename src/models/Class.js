import mongoose from 'mongoose';
import { type } from 'os';
import feedback from './feedback';

const ClassSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  // sessionNo:{
  //   type:Number,
  //   required:true
  // },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "courseName"

  },

  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users"
  },
  feedbackId: {
    type: mongoose.Schema.Types.ObjectId, //make array type array m object(feedbackid and user id)
    ref: "feedback"
  },
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assignment"
  },
  description: {
    type: String,
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },

  reasonForReschedule: {
    type: String,
    default: ""
  },
  reasonForCancelation: {
    type: String,
    default: ""
  },
  recurrenceType: {
    type: String,
    enum: ['daily', 'weekly', 'weekdays', null],
    default: null
  },
  // NEW: group id for recurring series (daily/weekly/weekdays)
  recurrenceId: {
    type: String,
    default: null,
  },
  recurrenceUntil: {
    type: Date,
    default: null
  },

  recording: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GridFSFile" // Reference to GridFS file
  },
  recordingFileName: String,      // Original filename

  recordingUrl: {
    type: String, // Storing the public S3 URL
    required: false, // Or true, if a recording is always expected
  },

  performanceVideo: {
    type: String, // Public S3 URL for the performance video
  },
  performanceVideoFileName: String, // Original filename

  groupPhoto: {
    type: String, // Public S3 URL for the group class photo
    default: "",
  },

  csat: {
    type: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
      },
      rating: {
        type: Number
      },
      feedback: String
    }]
  },
  status: {
    type: String,
    enum: ['scheduled', 'edited', 'rescheduled', 'completed', 'canceled'],
    default: 'scheduled'
  },
  classType:{
    type: String,
    enum: ['regular', 'makeup', 'trial'],
    default: 'regular'
  },

  joinLink: {
    type: String,
    default: null,
  },

  deleteRequest: {
    type: Boolean,
    default: false,
  },
  deleteRequestStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', null],
    default: null,
  },
  deleteRequestType: {
    type: String,
    enum: ['full', 'partial'],
    default: 'full',
  },
  deleteRequestStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
  }],

  // Class Quality Evaluation Data
  evaluation: {
    session_focus_clarity_score: Number,
    session_focus_clarity_score_justification: String,
    content_delivery_score: Number,
    content_delivery_justification: String,
    student_engagement_score: Number,
    student_engagement_justification: String,
    student_progress_score: Number,
    student_progress_justification: String,
    key_performance_score: Number,
    key_performance_justification: String,
    communication_score: Number,
    communication_justification: String,
    overall_quality_score: Number,
    overall_quality_justification: String
  }

}, {
  timestamps: true
});

// db.classes.createIndex({ startTime: 1 });
// db.classes.createIndex({ _id: 1, startTime: 1 });
// In Class model — replace existing index with:
ClassSchema.index({ course: 1, startTime: 1 });           // for this query
ClassSchema.index({ _id: 1, endTime: 1, status: 1 });

export default mongoose.models.Class || mongoose.model('Class', ClassSchema);
