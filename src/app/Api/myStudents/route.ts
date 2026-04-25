import { NextResponse, NextRequest } from 'next/server';
import { connect } from '@/dbConnection/dbConfic';
import courseName from '@/models/courseName';
import User from '@/models/userModel';
import jwt from 'jsonwebtoken';

await connect();

export async function GET(request: NextRequest) {
  try {
    const token = (() => {
      const referer = request.headers.get("referer") || "";
      let refererPath = "";
      try { if (referer) refererPath = new URL(referer).pathname; } catch (e) { }
      const isTutorContext =
        refererPath.startsWith("/tutor") ||
        request.nextUrl?.pathname?.startsWith("/Api/tutor");
      const impersonateToken = request.cookies.get("impersonate_token")?.value;
      const authHeader = request.headers.get("Authorization") || "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

      return (isTutorContext && impersonateToken)
        ? impersonateToken
        : (request.cookies.get("token")?.value || bearerToken || "");
    })();

    const decodedToken = token ? jwt.decode(token) : null;
    let tutorId =
      decodedToken && typeof decodedToken === 'object' && 'id' in decodedToken
        ? decodedToken.id
        : null;

    const url = new URL(request.url);
    const tutorIdParam = url.searchParams.get('tutorId');
    if (tutorIdParam) tutorId = tutorIdParam;

    const email = url.searchParams.get('email');
    const search = url.searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageLength = Math.max(1, parseInt(url.searchParams.get('pageLength') || '10', 10));
    const skip = (page - 1) * pageLength;

    if (!tutorId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please log in again" },
        { status: 401 }
      );
    }

    // ── Single-student email lookup ─────────────────────────────────────────
    if (email) {
      const user = await (User as any).findOne({
        email: { $regex: `^${email}$`, $options: 'i' },
        category: "Student",
      })
        .select('username email contact instructorId city profileImage assignment courses _id')
        .populate({
          path: 'courses',
          select: 'title category duration price courseQuality performanceScores instructorId',
          populate: [
            { path: 'instructorId', select: 'username email' },
            { path: 'performanceScores.userId', select: 'username email' },
          ],
        });

      const isAlreadyAdded = user?.instructorId?.includes(tutorId);
      return NextResponse.json({
        success: true,
        user: user
          ? {
            username: user.username, email: user.email, contact: user.contact,
            city: user.city, profileImage: user.profileImage,
            assignment: user.assignment, _id: user._id,
            courses: user.courses, isAlreadyAdded,
          }
          : null,
      });
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Tutor meta + course IDs in parallel ─────────────────────────────────
    const [tutor, tutorCourses] = await Promise.all([
      (User as any).findById(tutorId).select('academyId pendingAssignments').lean(),
      (courseName as any).find({ instructorId: tutorId }).select('_id').lean(),
    ]);

    const courseIds = (tutorCourses as any[]).map((c) => c._id);

    // ── Build query filter ───────────────────────────────────────────────────
    const filter: Record<string, any> = {
      category: "Student",
      $or: [
        { courses: { $in: courseIds } },
        { instructorId: tutorId },
      ],
    };

    if (search) {
      const re = { $regex: search, $options: 'i' };
      filter.$and = [{ $or: [{ username: re }, { email: re }] }];
    }
    // ───────────────────────────────────────────────────────────────────────

    const populateConfig = {
      path: 'courses',
      select: 'title category duration price courseQuality performanceScores instructorId',
      populate: [
        { path: 'instructorId', select: 'username email' },
        { path: 'performanceScores.userId', select: 'username email' },
      ],
    };

    // Count + paginated fetch in parallel
    const [totalCountRaw, usersRaw] = await Promise.all([
      (User as any).countDocuments(filter),
      (User as any).find(filter)
        .select('username email contact city profileImage assignment courses attendance instructorId _id')
        .populate(populateConfig)
        .skip(skip)
        .limit(pageLength)
        .lean(),
    ]);

    // TEMPORARY HIDE: Filter out students who do not have this tutorId in their instructorId array.
    // This hides students who were reassigned by the RM (since we removed the old tutor from instructorId).
    const users = (usersRaw as any[]).filter(u => 
      u.instructorId && u.instructorId.some((id: any) => id.toString() === tutorId.toString())
    );
    const totalCount = totalCountRaw - (usersRaw.length - users.length);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageLength));

    if (!users?.length) {
      return NextResponse.json({
        success: true,
        message: 'No students found',
        filteredUsers: [],
        userCount: 0,
        totalCount,
        totalPages,
        currentPage: page,
        academyId: (tutor as any)?.academyId || null,
      });
    }

    // ── Pending-assignments map ──────────────────────────────────────────────
    const pendingMap = new Map<string, number>();
    const pending = (tutor as any)?.pendingAssignments;
    if (Array.isArray(pending)) {
      pending.forEach((p: any) =>
        pendingMap.set(p.studentId.toString(), p.assignmentIds?.length || 0)
      );
    }

    const filteredUsers = (users as any[]).map((user) => ({
      _id: user._id,
      username: user.username,
      email: user.email,
      contact: user.contact,
      profileImage: user.profileImage,
      city: user.city,
      assignment: user.assignment,
      courses: user.courses,
      attendance: user.attendance,
      pendingAssignments: pendingMap.get(user._id.toString()) || 0,
      pendingAssignmentCount: pendingMap.get(user._id.toString()) || 0,
    }));

    return NextResponse.json({
      success: true,
      message: 'Students fetched successfully',
      filteredUsers,
      userCount: filteredUsers.length,
      totalCount,
      totalPages,
      currentPage: page,
      academyId: (tutor as any)?.academyId || null,
    });

  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch students. Please try again.',
      },
      { status: 500 }
    );
  }
}


export async function DELETE(request: NextRequest) {
  try {
    // Connect to database
    await connect();

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    // Validate studentId
    if (!studentId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Student ID is required'
        },
        { status: 400 }
      );
    }

    // Find and delete the student
    const deletedStudent = await (User as any).findByIdAndDelete(studentId);

    if (!deletedStudent) {
      return NextResponse.json(
        {
          success: false,
          message: 'Student not found'
        },
        { status: 404 }
      );
    }

    // Return success response
    return NextResponse.json(
      {
        success: true,
        message: 'Student removed successfully'
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error deleting student:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error. Failed to delete student.'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connect();

    // Get tutor ID from token
    const token = (() => {
      const referer = request.headers.get("referer") || "";
      let refererPath = "";
      try { if (referer) refererPath = new URL(referer).pathname; } catch (e) { }
      const isTutorContext = refererPath.startsWith("/tutor") || (request.nextUrl && request.nextUrl.pathname && request.nextUrl.pathname.startsWith("/Api/tutor"));
      return (isTutorContext && request.cookies.get("impersonate_token")?.value) ? request.cookies.get("impersonate_token")?.value : request.cookies.get("token")?.value;
    })();
    const decodedToken = token ? jwt.decode(token) : null;
    const tutorId = decodedToken && typeof decodedToken === 'object' && 'id' in decodedToken ? decodedToken.id : null;

    if (!tutorId) {
      return NextResponse.json({
        success: false,
        error: "Unauthorized - Tutor not found"
      }, { status: 401 });
    }

    // Get student email from request body
    const { email } = await request.json();

    // Find the student
    const student = await (User as any).findOne({
      email: { $regex: `^${email}$`, $options: 'i' }
    });

    const instructor = await (User as any).findById(tutorId);


    if (!student) {
      return NextResponse.json({
        success: false,
        error: "Student not found"
      }, { status: 404 });
    }

    // Check if tutor is already in student's instructorId array
    if (student.instructorId?.includes(tutorId)) {
      return NextResponse.json({
        success: false,
        error: "Student is already in your list"
      });
    }

    // Add tutor to student's instructorId array
    await (User as any).findByIdAndUpdate(
      student._id,
      { $push: { instructorId: tutorId } },
      { new: true }
    );

    if (instructor.category == "Academic") {
      await (User as any).findByIdAndUpdate(
        student._id,
        { $set: { academyId: tutorId } },
        { new: true }
      );
    }

    await (User as any).findByIdAndUpdate(
      tutorId,
      { $push: { students: student._id } },
      { new: true }
    );



    return NextResponse.json({
      success: true,
      message: "Student added to your list successfully",
      student: {
        _id: student._id,
        username: student.username,
        email: student.email,
        contact: student.contact
      }
    });

  } catch (error: any) {
    console.error("Error adding student:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to add student"
    }, { status: 500 });
  }
}


