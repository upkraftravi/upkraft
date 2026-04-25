// src/app/Api/classes/route.ts
import { NextResponse, NextRequest } from "next/server";
import { connect } from "@/dbConnection/dbConfic";
import Class from "@/models/Class";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { log } from "console";
import jwt from "jsonwebtoken";
import courseName from "@/models/courseName";
import User from "@/models/userModel";
// ADD these imports
import * as dateFnsTz from 'date-fns-tz';
import { format, parseISO } from 'date-fns';
import { sendEmail } from "@/helper/mailer";
// import { getServerSession } from 'next-auth/next'; // If using next-auth
import { sendExpoPushNotifications } from '@/lib/pushNotifications';
import { getDataFromToken } from "@/helper/getDataFromToken";

await connect();

export async function POST(request: NextRequest) {
  try {
    console.log(
      "1111111111111111111111111111111111111111111111111111111111111111111"
    );
    console.log("date-fns-tz exports:", Object.keys(dateFnsTz));


    const referer = request.headers.get("referer");

    console.log("Full Referer:", referer);

    // Parse the courseId from the Referer URL
    let courseId = null;
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        courseId = refererUrl.searchParams.get("courseId");

        console.log("Extracted CourseId:", courseId);
      } catch (error) {
        console.error("Error parsing Referer URL:", error);
      }
    }

    // NOTE: Do not validate courseId here yet — we may get it from formData below (copy requests)

    const uploadDir = path.join(process.cwd(), "public/uploads");

    // Ensure upload directory exists
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Parse the FormData in App Router
    const formData = await request.formData();

    // Extract form fields
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const date = formData.get("date") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    const timezone = formData.get("timezone") as string; // Get timezone from frontend

    const joinLink = formData.get("joinLink") as string | null;
    const rawRecurrenceId = formData.get("recurrenceId") as string | null;
    const rawRecurrenceType = formData.get("recurrenceType") as string | null;
    const rawRecurrenceUntil = formData.get("recurrenceUntil") as string | null;

    const allowedTypes = ["daily", "weekly", "weekdays"];
    const isRecurring =
      !!rawRecurrenceId &&
      !!rawRecurrenceType &&
      allowedTypes.includes(rawRecurrenceType);

    const recurrenceId = isRecurring ? rawRecurrenceId : null;
    const recurrenceType = isRecurring ? rawRecurrenceType : null;
    const recurrenceUntil =
      isRecurring && rawRecurrenceUntil ? new Date(rawRecurrenceUntil) : null;

    // Accept courseId from referer OR formData OR query param (covers client copy flows)
    if (!courseId) {
      const url = new URL(request.url);
      const courseIdFromQuery = url.searchParams.get("courseId");
      const courseFromForm = (formData.get("course") as string) || (formData.get("courseId") as string);
      courseId = courseFromForm || courseIdFromQuery || null;
    }

    // Validate courseId after parsing FormData / query fallback
    if (!courseId) {
      return NextResponse.json(
        { error: "Course ID is required" },
        { status: 400 }
      );
    }

    console.log("Received data:", {
      title,
      description,
      date,
      startTime,
      endTime,
      timezone,
    });


    // NEW: Simple timezone conversion using date-fns-tz
    const convertToUTC = (dateStr: string, timeStr: string, timezone: string): Date => {
      const dateTimeStr = `${dateStr} ${timeStr}`;
      return dateFnsTz.fromZonedTime(dateTimeStr, timezone);
    };
    const startDateTime = convertToUTC(date, startTime, timezone || "UTC");
    const endDateTime = convertToUTC(date, endTime, timezone || "UTC");

    
    console.log("Timezone conversion:", {
      input: `${date} ${startTime}-${endTime} in ${timezone}`,
      storedUTC_Start: startDateTime.toISOString(),
      storedUTC_End: endDateTime.toISOString(),
      verifyStart: format(dateFnsTz.toZonedTime(startDateTime, timezone || "UTC"), 'HH:mm'),
      verifyEnd: format(dateFnsTz.toZonedTime(endDateTime, timezone || "UTC"), 'HH:mm')
    });
    const token = (() => {
      const referer = request.headers.get("referer") || "";
      let refererPath = "";
      try { if (referer) refererPath = new URL(referer).pathname; } catch (e) {}
      const isTutorContext = refererPath.startsWith("/tutor") || (request.nextUrl && request.nextUrl.pathname && request.nextUrl.pathname.startsWith("/Api/tutor"));
      return (isTutorContext && request.cookies.get("impersonate_token")?.value) ? request.cookies.get("impersonate_token")?.value : request.cookies.get("token")?.value;
    })();
    const decodedToken = token ? jwt.decode(token) : null;
    const instructorId =
      decodedToken && typeof decodedToken === "object" && "id" in decodedToken
        ? decodedToken.id
        : null;

    // Handle video upload
    let videoPath = null;
    const videoFile = formData.get("video") as File | null;

    if (videoFile && videoFile.size > 0) {
      const originalFilename = videoFile.name;
      const newFilename = `${Date.now()}-${originalFilename}`;
      const newPath = path.join(uploadDir, newFilename);

      // Convert file to ArrayBuffer, then Buffer
      const arrayBuffer = await videoFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Write file to disk
      await writeFile(newPath, buffer);

      // Store the relative path in the database
      videoPath = `/uploads/${newFilename}`;
    }

    // Create a new Class document
    console.log("222222222222222222222222222222222222222222222222222");

    const newClass = new Class({
      title,
      description,
      course: courseId,
      startTime: startDateTime,
      endTime: endDateTime,
      instructor: instructorId,
      recording: videoPath,
      recordingProcessed: videoPath ? 0 : null,
      recurrenceId,
      recurrenceType,
      recurrenceUntil,
      joinLink: joinLink || null,
    });

    const savednewClass = await newClass.save();
    console.log("333333333333333333333333333333333333333333333333333333333333");
    console.log("Saved class:", savednewClass);

    const course = await courseName.findById(courseId);
    await courseName.findByIdAndUpdate(courseId, {
      $addToSet: { class: savednewClass._id },
    });

    // Update users enrolled in this course
    await User.updateMany(
      { courses: courseId , category:"Tutor"},
      { $addToSet: { classes: savednewClass._id } }
    );

    console.log(newClass);

    return NextResponse.json(
      {
        message: "Session created successfully",
        classData: newClass,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      {
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
// export async function GET(request: NextRequest) {
//   try {
//     console.log("Fetching classes data...");

//     const token = (() => {
//       const referer = request.headers.get("referer") || "";
//       let refererPath = "";
//       try { if (referer) refererPath = new URL(referer).pathname; } catch (e) {}
//       const isTutorContext = refererPath.startsWith("/tutor") || (request.nextUrl && request.nextUrl.pathname && request.nextUrl.pathname.startsWith("/Api/tutor"));
//       return (isTutorContext && request.cookies.get("impersonate_token")?.value) ? request.cookies.get("impersonate_token")?.value : request.cookies.get("token")?.value;
//     })();
//     const decodedToken = token ? jwt.decode(token) : null;
//     let instructorId =
//       decodedToken && typeof decodedToken === "object" && "id" in decodedToken
//         ? decodedToken.id
//         : null;

//     // Check for userid query parameter
//     const { searchParams } = new URL(request.url);
//     const userIdFromQuery = searchParams.get("userid");

//     // If userid query param exists, use it as the student ID
//     if (userIdFromQuery) {
//       instructorId = userIdFromQuery;
//       console.log("Using userid from query param:", userIdFromQuery);
//     }

//     console.log("decodedToken : ", decodedToken);
//     console.log("Final instructorId : ", instructorId);

//     if (!instructorId) {
//       return NextResponse.json(
//         {
//           message: "User ID not found",
//           error: "No user ID provided",
//         },
//         { status: 400 }
//       );
//     }

//     // Find the user and populate the classes array with actual class details
//     const user = await User.findById(instructorId).populate({
//       path: "classes",
//       model: "Class", // Make sure this matches your Class model name
//     }).select("-description -evaluation").lean();

//     if (!user) {
//       return NextResponse.json(
//         {
//           message: "User not found",
//           error: "No user found with the provided ID",
//         },
//         { status: 404 }
//       );
//     }

//     // Get the populated class data
//     const classData = user.classes || [];

//     console.log("Found classes:", classData.length);

//     return NextResponse.json(
//       {
//         message: "Classes fetched successfully",
//         classData: classData,
//         totalClasses: classData.length,
//       },
//       { status: 200 }
//     );
//   } catch (error) {
//     console.error("Server error:", error);
//     return NextResponse.json(
//       {
//         message: "Server error",
//         error: error instanceof Error ? error.message : "Unknown error",
//       },
//       { status: 500 }
//     );
//   }
// }
export async function GET(request: NextRequest) {
  try {
    await connect();

    console.log("Fetching classes data...");

    // Priority 1: impersonation token (RSM acting as tutor — web only)
    // Priority 2: session cookie (web browser)
    // Priority 3: Bearer token in Authorization header (React Native mobile app)
    const referer = request.headers.get("referer") || "";
    let refererPath = "";
    try { if (referer) refererPath = new URL(referer).pathname; } catch (e) {}
    const isTutorContext = refererPath.startsWith("/tutor") || (request.nextUrl && request.nextUrl.pathname && request.nextUrl.pathname.startsWith("/Api/tutor"));
    const impersonateToken = request.cookies.get("impersonate_token")?.value;
    const authHeader = request.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const token = (isTutorContext && impersonateToken)
      ? impersonateToken
      : (request.cookies.get("token")?.value || bearerToken || "");
    const decodedToken = token ? jwt.decode(token) : null;
    let instructorId =
      decodedToken && typeof decodedToken === "object" && "id" in decodedToken
        ? decodedToken.id
        : null;

    // Check for userid query parameter
    const { searchParams } = new URL(request.url);
    const userIdFromQuery = searchParams.get("userid");

    // If userid query param exists, use it as the student ID
    if (userIdFromQuery) {
      instructorId = userIdFromQuery;
      console.log("Using userid from query param:", userIdFromQuery);
    }

    console.log("decodedToken : ", decodedToken);
    console.log("Final instructorId : ", instructorId);

    if (!instructorId) {
      return NextResponse.json(
        {
          message: "User ID not found",
          error: "No user ID provided",
        },
        { status: 400 }
      );
    }

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const category = searchParams.get("category");
    const subCategory = searchParams.get("subCategory");
    const courseId = searchParams.get("courseId");

    const user = await User.findById(instructorId).select("classes").lean();

    if (!user) {
      return NextResponse.json(
        {
          message: "User not found",
          error: "No user found with the provided ID",
        },
        { status: 404 }
      );
    }

    const query: any = {
      _id: { $in: user.classes || [] }
    };

    if (startDate && endDate) {
      query.startTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (courseId) {
      query.course = courseId;
    }

    let classQuery = Class.find(query)
      .populate({
        path: "course",
        select: "title category subCategory maxStudentCount studentEnrolledCount"
      })
      .select("-description -evaluation")
      .lean();

    const classData = await classQuery;

    let filteredClasses = classData;

    if (category) {
      filteredClasses = filteredClasses.filter(
        (cls: any) => cls.course?.category === category
      );
    }

    if (subCategory) {
      filteredClasses = filteredClasses.filter(
        (cls: any) => cls.course?.subCategory === subCategory
      );
    }


    // Reverse-lookup: find students enrolled in any of these classes
    const classIds = filteredClasses.map((c: any) => c._id);
    const enrolledStudents = await User.find(
      { classes: { $in: classIds }, category: "Student" },
      "_id username email address city classes"
    ).lean();

    // Attach students array to each class (no schema change needed)
    const classDataWithStudents = filteredClasses.map((c: any) => ({
      ...c,
      students: enrolledStudents
        .filter((s: any) =>
          s.classes.some((cId: any) => cId.toString() === c._id.toString())
        )
        .map((s: any) => ({
          _id: s._id,
          username: s.username,
          email: s.email,
          address: s.address ?? "",
          city: s.city ?? "",
        })),
    }));

    return NextResponse.json(
      {
        message: "Classes fetched successfully",
        classData: classDataWithStudents,
        totalClasses: classDataWithStudents.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      {
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
export async function PUT(request: NextRequest) {
  try {
    console.log("Updating class...");

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const editType = (searchParams.get("editType") || "single").toLowerCase();

    if (!classId) {
      return NextResponse.json(
        { error: "Class ID is required" },
        { status: 400 }
      );
    }

    const token = (() => {
      const referer = request.headers.get("referer") || "";
      let refererPath = "";
      try { if (referer) refererPath = new URL(referer).pathname; } catch (e) {}
      const isTutorContext = refererPath.startsWith("/tutor") || (request.nextUrl && request.nextUrl.pathname && request.nextUrl.pathname.startsWith("/Api/tutor"));
      return (isTutorContext && request.cookies.get("impersonate_token")?.value) ? request.cookies.get("impersonate_token")?.value : request.cookies.get("token")?.value;
    })();
    const decodedToken = token ? jwt.decode(token) : null;
    const instructorId =
      decodedToken && typeof decodedToken === "object" && "id" in decodedToken
        ? decodedToken.id
        : null;

    if (!instructorId) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const existingClass = await Class.findById(classId);
    if (!existingClass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      description,
      date,
      startTime,
      endTime,
      timezone,
      reasonForReschedule,
      joinLink,
      status,
      updateIntent,
    } = body;

    console.log("RECEIVED:", { title, description, date, startTime, endTime, timezone, reasonForReschedule, editType, status, updateIntent });

    if (!title || !description || !startTime || !endTime || (editType === "single" && !date)) {
      return NextResponse.json(
        { error: "All required fields are missing or invalid" },
        { status: 400 }
      );
    }

    if (endTime <= startTime) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 }
      );
    }

    const userTz = timezone || 'UTC';

    // ── BULK series update (all occurrences sharing recurrenceId) ──
    if (editType === 'all' && existingClass.recurrenceId) {
      const recurrenceId = existingClass.recurrenceId;

      const docs = await Class.find({ recurrenceId });
      if (!docs.length) {
        return NextResponse.json(
          { error: 'No classes found for this series' },
          { status: 404 }
        );
      }

      const trimmedReason = (reasonForReschedule ?? '').toString().trim();
      const normalizedIntent = (updateIntent ?? '').toString().trim().toLowerCase();
      const normalizedStatus = (status ?? '').toString().trim().toLowerCase();
      const isExplicitEdit = normalizedIntent === 'edit';
      const isExplicitReschedule =
        normalizedIntent === 'reschedule' || normalizedStatus === 'rescheduled';

      const ops = docs.map((doc) => {
        // Keep each class on its own date, only change time/title/description
        const localStart = dateFnsTz.toZonedTime(doc.startTime, userTz);
        const dateStrForDoc = format(localStart, 'yyyy-MM-dd');

        const dateTimeStrForDoc = `${dateStrForDoc}T${startTime}:00`;
        const endDateTimeStrForDoc = `${dateStrForDoc}T${endTime}:00`;

        const newStart = dateFnsTz.fromZonedTime(dateTimeStrForDoc, userTz);
        const newEnd = dateFnsTz.fromZonedTime(endDateTimeStrForDoc, userTz);

        const scheduleChangedForDoc =
          doc.startTime.getTime() !== newStart.getTime() ||
          doc.endTime.getTime() !== newEnd.getTime();

        const setPayload: any = {
          title,
          description,
          startTime: newStart,
          endTime: newEnd,
          ...(joinLink !== undefined && { joinLink: joinLink || null }),
        };

        if (trimmedReason || isExplicitEdit || isExplicitReschedule || scheduleChangedForDoc) {
          setPayload.reasonForReschedule = trimmedReason;
          setPayload.status = isExplicitEdit ? 'scheduled' : 'rescheduled';
        }

        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: setPayload },
          },
        };
      });

      const result = await Class.bulkWrite(ops);
      const modified =
        (result as any).modifiedCount ??
        Object.values(result as any).reduce(
          (a: number, b: any) => a + (b?.nModified || 0),
          0
        );

      console.log('Series updated in UTC for recurrenceId:', recurrenceId);

      return NextResponse.json(
        {
          message: 'Series updated successfully',
          editType: 'all',
          recurrenceId,
          updatedCount: modified,
        },
        { status: 200 }
      );
    }

    // ── SINGLE class update (default/fallback) ──
    const dateTimeStr = `${date}T${startTime}:00`;
    const endDateTimeStr = `${date}T${endTime}:00`;

    const startDateTime = dateFnsTz.fromZonedTime(dateTimeStr, userTz);
    const endDateTime = dateFnsTz.fromZonedTime(endDateTimeStr, userTz);

    console.log("STORING IN UTC:", {
      inputTime: `${startTime} - ${endTime}`,
      userTimezone: userTz,
      storedStartUTC: startDateTime.toISOString(),
      storedEndUTC: endDateTime.toISOString(),
    });

    const scheduleChanged =
      existingClass.startTime.getTime() !== startDateTime.getTime() ||
      existingClass.endTime.getTime() !== endDateTime.getTime();

    const updatePayload: any = {
      title,
      description,
      startTime: startDateTime, // Store in UTC
      endTime: endDateTime, // Store in UTC
      ...(joinLink !== undefined && { joinLink: joinLink || null }),
    };

    const normalizedIntent = (updateIntent ?? '').toString().trim().toLowerCase();
    const normalizedStatus = (status ?? '').toString().trim().toLowerCase();
    const isExplicitEdit = normalizedIntent === 'edit';
    const isExplicitReschedule =
      normalizedIntent === 'reschedule' || normalizedStatus === 'rescheduled';

    if ((reasonForReschedule && String(reasonForReschedule).trim()) || isExplicitEdit || isExplicitReschedule || scheduleChanged) {
      updatePayload.reasonForReschedule = reasonForReschedule;
      updatePayload.status = isExplicitEdit ? 'scheduled' : 'rescheduled';
    }

    const updatedClass = await Class.findByIdAndUpdate(
      classId,
      updatePayload,
      { new: true, runValidators: true }
    );

    console.log("STORED SUCCESSFULLY IN UTC");

    // Send notifications only for actual reschedule updates.
    try {
      if (updatePayload.status !== 'rescheduled') {
        return NextResponse.json(
          {
            message: "Class updated successfully",
            classData: updatedClass,
            editType: 'single',
            updatedCount: 1,
          },
          { status: 200 }
        );
      }

      // Find all users (students) who have this classId in their classes array
      const enrolledStudents = await User.find({
        classes: classId,
      }).select("email username timezone expoPushToken").lean();

      console.log(`Found ${enrolledStudents.length} students enrolled in this class`);

      if (enrolledStudents.length === 0) {
        console.log("No students enrolled in this class");
      } else {
        // Get course name from the class
        const course = await courseName.findById(existingClass.course);
        const courseTitle = course ? course.title : "Your Course";

        // Format date and time for email
        const formatDateTimeForEmail = (dateTime: Date, tz: string) => {
          try {
            // Convert UTC to user's timezone for display
            const zonedDate = dateFnsTz.toZonedTime(dateTime, tz);

            const dateStr = format(zonedDate, 'EEEE, MMMM d, yyyy'); // e.g., "Monday, January 15, 2024"
            const timeStr = format(zonedDate, 'h:mm a'); // e.g., "2:30 PM"

            return { date: dateStr, time: timeStr };
          } catch (error) {
            console.error("Error formatting date:", error);
            return {
              date: dateTime.toLocaleDateString(),
              time: dateTime.toLocaleTimeString()
            };
          }
        };

        const { date: newDateFormatted, time: newTimeStart } = formatDateTimeForEmail(startDateTime, timezone || 'UTC');
        const { time: newTimeEnd } = formatDateTimeForEmail(endDateTime, timezone || 'UTC');
        const newTimeRange = `${newTimeStart} - ${newTimeEnd}`;

        // Send email to each enrolled student
        const emailPromises = enrolledStudents.map(async (student) => {
          try {
            console.log(`Attempting to send email to: ${student.email}, Username: ${student.username}`);

            await sendEmail({
              email: student.email,
              emailType: "CLASS_RESCHEDULED",
              username: student.username,
              courseName: courseTitle,
              className: title,
              newDate: newDateFormatted,
              newTime: newTimeRange,
              reasonForReschedule: reasonForReschedule,
            });

            console.log(`✅ Reschedule email sent successfully to: ${student.email}`);
          } catch (emailError) {
            console.error(`❌ Failed to send email to ${student.email}:`, emailError);
            // Don't throw - continue sending to other students
          }
        });

        await Promise.all(emailPromises);
        console.log("All reschedule notification emails processed");

        // Send push notifications to students + tutor
        const tutorUser = await User.findById(instructorId).select('expoPushToken').lean() as any;
        const studentTokens = (enrolledStudents as any[]).map((s: any) => s.expoPushToken);
        sendExpoPushNotifications(
          [...studentTokens, tutorUser?.expoPushToken],
          'Class Rescheduled',
          `${title} rescheduled to ${newDateFormatted} at ${newTimeStart}`,
          { classId }
        );
      }
    } catch (emailError) {
      console.error("Error in email sending process:", emailError);
      // Don't fail the entire request if emails fail
    }

    return NextResponse.json(
      {
        message: "Class updated successfully",
        classData: updatedClass,
        editType: 'single',
        updatedCount: 1,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      {
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// PATCH - Update class title only (mobile app — no reschedule emails, no status change)
export async function PATCH(request: NextRequest) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    if (!classId) return NextResponse.json({ error: 'Class ID is required' }, { status: 400 });

    const userId = await getDataFromToken(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { title } = await request.json();
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    const updatedClass = await Class.findByIdAndUpdate(
      classId,
      { title: title.trim() },
      { new: true }
    );
    if (!updatedClass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    return NextResponse.json({ success: true, data: updatedClass });
  } catch (error: any) {
    console.error('Error updating class title:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Cancel existing class (single or entire series)
export async function DELETE(request: NextRequest) {
  try {
    console.log("Cancelling class...");

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const deleteType = (searchParams.get("deleteType") || "single").toLowerCase(); // "single" | "all" | "following"

    if (!classId) {
      return NextResponse.json(
        { error: "Class ID is required" },
        { status: 400 }
      );
    }

    const token = (() => {
      const referer = request.headers.get("referer") || "";
      let refererPath = "";
      try { if (referer) refererPath = new URL(referer).pathname; } catch (e) {}
      const isTutorContext = refererPath.startsWith("/tutor") || (request.nextUrl && request.nextUrl.pathname && request.nextUrl.pathname.startsWith("/Api/tutor"));
      return (isTutorContext && request.cookies.get("impersonate_token")?.value) ? request.cookies.get("impersonate_token")?.value : request.cookies.get("token")?.value;
    })();
    const decodedToken = token ? jwt.decode(token) : null;
    const instructorId =
      decodedToken && typeof decodedToken === "object" && "id" in decodedToken
        ? decodedToken.id
        : null;

    if (!instructorId) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({} as any));
    const { reasonForCancellation, timezone } = body;

    if (!reasonForCancellation) {
      return NextResponse.json(
        { error: "Reason for cancellation is required" },
        { status: 400 }
      );
    }

    const tz = timezone || "UTC";

    // Shared formatter for emails
    const formatDateTimeForEmail = (dateTime: Date, tzLocal: string) => {
      try {
        const zonedDate = dateFnsTz.toZonedTime(dateTime, tzLocal);
        const dateStr = format(zonedDate, "EEEE, MMMM d, yyyy");
        const timeStr = format(zonedDate, "h:mm a");
        return { date: dateStr, time: timeStr };
      } catch (error) {
        console.error("Error formatting date:", error);
        return {
          date: dateTime.toLocaleDateString(),
          time: dateTime.toLocaleTimeString(),
        };
      }
    };

    // --- Cancel entire series (all events with same recurrenceId) ---
    if (deleteType === "all") {
      const templateClass = await Class.findById(classId);
      if (!templateClass) {
        return NextResponse.json(
          { error: "Class not found" },
          { status: 404 }
        );
      }

      if (!templateClass.recurrenceId) {
        console.log(
          "No recurrenceId on class; falling back to single cancellation"
        );
      } else {
        const recurrenceId = templateClass.recurrenceId;
        console.log("Cancelling entire series with recurrenceId:", recurrenceId);

        const classesToCancel = await Class.find({ recurrenceId });
        if (classesToCancel.length === 0) {
          return NextResponse.json(
            { error: "No classes found for this series" },
            { status: 404 }
          );
        }

        const classIds = classesToCancel.map((c) => c._id);

        // Mark all classes in the series as canceled
        await Class.updateMany(
          { _id: { $in: classIds } },
          {
            status: "canceled",
            reasonForCancelation: reasonForCancellation,
          }
        );

        // Send cancellation emails for each class in the series
        try {
          for (const cls of classesToCancel) {
            const studentsForClass = await User.find({
              classes: cls._id,
            }).select("email username");

            if (studentsForClass.length === 0) continue;

            const course = await courseName.findById(cls.course);
            const courseTitle = course ? course.title : "Your Course";

            const { date: originalDate, time: originalTimeStart } =
              formatDateTimeForEmail(cls.startTime, tz);
            const { time: originalTimeEnd } = formatDateTimeForEmail(
              cls.endTime,
              tz
            );
            const originalTimeRange = `${originalTimeStart} - ${originalTimeEnd}`;

            await Promise.all(
              studentsForClass.map(async (student: any) => {
                try {
                  console.log(
                    `Attempting to send series cancellation email to: ${student.email}`
                  );
                  await sendEmail({
                    email: student.email,
                    emailType: "CLASS_CANCELLED",
                    username: student.username,
                    courseName: courseTitle,
                    className: cls.title,
                    originalDate,
                    originalTime: originalTimeRange,
                    reasonForCancellation,
                  });
                  console.log(
                    `✅ Series cancellation email sent to: ${student.email}`
                  );
                } catch (emailError) {
                  console.error(
                    `❌ Failed to send series cancellation email to ${student.email}:`,
                    emailError
                  );
                }
              })
            );
          }
          console.log("All series cancellation notification emails processed");
        } catch (emailError) {
          console.error(
            "Error in email sending process for series:",
            emailError
          );
          // Continue even if email sending fails
        }

        console.log("Series cancelled successfully");

        return NextResponse.json(
          {
            message:
              "All events in this series cancelled and students notified",
            recurrenceId,
            cancelledCount: classesToCancel.length,
          },
          { status: 200 }
        );
      }
      // If we get here (no recurrenceId) we fall through to single-cancel logic.
    }

    // --- Cancel following events (from selected date through end of series) ---
    if (deleteType === "following") {
      const fromClass = await Class.findById(classId);
      if (!fromClass) {
        return NextResponse.json(
          { error: "Class not found" },
          { status: 404 }
        );
      }
      const recurrenceId = fromClass.recurrenceId;
      const fromStartTime = fromClass.startTime;

      if (!recurrenceId) {
        // No series: cancel only this occurrence (same as single)
        await Class.findByIdAndUpdate(classId, {
          status: "canceled",
          reasonForCancelation: reasonForCancellation,
        });
        // Send email for this single class (reuse same logic as single below via fall-through or inline)
        try {
          const enrolledStudents = await User.find({ classes: classId });
          if (enrolledStudents.length > 0) {
            const course = await courseName.findById(fromClass.course);
            const courseTitle = course ? course.title : "Your Course";
            const { date: originalDate, time: originalTimeStart } =
              formatDateTimeForEmail(fromClass.startTime, tz);
            const { time: originalTimeEnd } =
              formatDateTimeForEmail(fromClass.endTime, tz);
            const originalTimeRange = `${originalTimeStart} - ${originalTimeEnd}`;
            await Promise.all(
              enrolledStudents.map((student: any) =>
                sendEmail({
                  email: student.email,
                  emailType: "CLASS_CANCELLED",
                  username: student.username,
                  courseName: courseTitle,
                  className: fromClass.title,
                  originalDate,
                  originalTime: originalTimeRange,
                  reasonForCancellation,
                })
              )
            );
          }
        } catch (emailError) {
          console.error("Error sending cancellation email:", emailError);
        }
        return NextResponse.json(
          { message: "Class cancelled and students notified" },
          { status: 200 }
        );
      }

      const classesToCancel = await Class.find({
        recurrenceId,
        startTime: { $gte: fromStartTime },
      }).sort({ startTime: 1 });

      if (classesToCancel.length === 0) {
        return NextResponse.json(
          { error: "No classes found to cancel" },
          { status: 404 }
        );
      }

      const idsToCancel = classesToCancel.map((c) => c._id);
      await Class.updateMany(
        { _id: { $in: idsToCancel } },
        {
          status: "canceled",
          reasonForCancelation: reasonForCancellation,
        }
      );

      try {
        for (const cls of classesToCancel) {
          const studentsForClass = await User.find({
            classes: cls._id,
          }).select("email username");
          if (studentsForClass.length === 0) continue;
          const course = await courseName.findById(cls.course);
          const courseTitle = course ? course.title : "Your Course";
          const { date: originalDate, time: originalTimeStart } =
            formatDateTimeForEmail(cls.startTime, tz);
          const { time: originalTimeEnd } = formatDateTimeForEmail(
            cls.endTime,
            tz
          );
          const originalTimeRange = `${originalTimeStart} - ${originalTimeEnd}`;
          await Promise.all(
            studentsForClass.map(async (student: any) => {
              try {
                await sendEmail({
                  email: student.email,
                  emailType: "CLASS_CANCELLED",
                  username: student.username,
                  courseName: courseTitle,
                  className: cls.title,
                  originalDate,
                  originalTime: originalTimeRange,
                  reasonForCancellation,
                });
              } catch (emailError) {
                console.error(
                  `Failed to send cancellation email to ${student.email}:`,
                  emailError
                );
              }
            })
          );
        }
      } catch (emailError) {
        console.error("Error in email sending for cancel following:", emailError);
      }

      return NextResponse.json(
        {
          message:
            "Events from this date onward have been cancelled and students notified",
          cancelledCount: classesToCancel.length,
        },
        { status: 200 }
      );
    }

    // --- Single-class cancellation (existing behaviour) ---

    // Mark class as cancelled (don't delete)
    const classToCancel = await Class.findByIdAndUpdate(classId, {
      status: "canceled",
      reasonForCancelation: reasonForCancellation,
    });

    if (!classToCancel) {
      return NextResponse.json(
        { error: "Class not found" },
        { status: 404 }
      );
    }

    // Send cancellation emails to all enrolled students
    try {
      const enrolledStudents = await User.find({
        classes: classId,
      });

      console.log(
        `Found ${enrolledStudents.length} students enrolled in this class`
      );

      if (enrolledStudents.length > 0) {
        const course = await courseName.findById(classToCancel.course);
        const courseTitle = course ? course.title : "Your Course";

        const { date: originalDate, time: originalTimeStart } =
          formatDateTimeForEmail(classToCancel.startTime, tz);
        const { time: originalTimeEnd } = formatDateTimeForEmail(
          classToCancel.endTime,
          tz
        );
        const originalTimeRange = `${originalTimeStart} - ${originalTimeEnd}`;

        const emailPromises = enrolledStudents.map(async (student: any) => {
          try {
            console.log(
              `Attempting to send cancellation email to: ${student.email}`
            );

            await sendEmail({
              email: student.email,
              emailType: "CLASS_CANCELLED",
              username: student.username,
              courseName: courseTitle,
              className: classToCancel.title,
              originalDate,
              originalTime: originalTimeRange,
              reasonForCancellation,
            });

            console.log(
              `✅ Cancellation email sent successfully to: ${student.email}`
            );
          } catch (emailError) {
            console.error(
              `❌ Failed to send email to ${student.email}:`,
              emailError
            );
          }
        });

        await Promise.all(emailPromises);
        console.log("All cancellation notification emails processed");

        // Send push notifications to students + tutor
        const tutorUser = await User.findById(instructorId).select('expoPushToken').lean() as any;
        const studentTokens = (enrolledStudents as any[]).map((s: any) => s.expoPushToken);
        sendExpoPushNotifications(
          [...studentTokens, tutorUser?.expoPushToken],
          'Class Cancelled',
          `${classToCancel.title} has been cancelled`,
          { classId }
        );
      }
    } catch (emailError) {
      console.error("Error in email sending process:", emailError);
      // Continue with cancellation even if emails fail
    }

    console.log("Class cancelled successfully");

    return NextResponse.json(
      {
        message: "Class cancelled and students notified",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      {
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}