"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  Calendar,
  BookOpen,
  Users,
  PlusCircle,
  User,
  BookMarkedIcon,
  BookCheck,
  CheckCircle,
  Clock,
  AlertCircle,
  Menu,
  X,
  Home,
} from "lucide-react";
import Image from "next/image";
import { PiNutBold } from "react-icons/pi";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { formatInTz, formatTimeRangeInTz, getUserTimeZone } from "@/helper/time";

interface UserData {
  _id: string;
  username?: string;
  name?: string;
  email?: string;
  category: string;
}

const STATUS_COLORS = {
  present: {
    bg: "bg-green-50",
    border: "border-green-400",
    text: "text-green-700",
    dot: "bg-green-500",
    label: "Present",
  },
  absent: {
    bg: "bg-red-50",
    border: "border-red-400",
    text: "text-red-700",
    dot: "bg-red-500",
    label: "Absent",
  },
  cancelled: {
    bg: "bg-gray-100",
    border: "border-gray-400",
    text: "text-gray-500",
    dot: "bg-gray-400",
    strikethrough: "line-through",
    label: "Cancelled",
  },
  rescheduled: {
    bg: "bg-blue-50",
    border: "border-blue-400",
    text: "text-blue-700",
    dot: "bg-blue-500",
    label: "Rescheduled",
  },
  edited: {
    bg: "bg-blue-50",
    border: "border-blue-400",
    text: "text-blue-700",
    dot: "bg-blue-500",
    label: "Edited",
  },
  rescheduled_present: {
    bg: "bg-teal-50",
    border: "border-teal-400",
    text: "text-teal-700",
    dot: "bg-teal-500",
    label: "Rescheduled (Present)",
  },
  pending: {
    bg: "bg-purple-50",
    border: "border-purple-400",
    text: "text-purple-700",
    dot: "bg-purple-500",
    label: "Pending",
  },
};

const StudentCalendarView = () => {
  const router = useRouter();
  // remove tutor/students list focus; add own schedule + assignments
  const [myClasses, setMyClasses] = useState<any[]>([]);
  const [myAssignments, setMyAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  
  // Add view state
  const [activeView, setActiveView] = useState<"day" | "week" | "month">("week");
  const handleSetView = (v: "day" | "week" | "month") => {
    setActiveView(v);
  };
 
  // fetch attendance for current student (used to display present/absent)
  useEffect(() => {
    if (!userId) return;

    const fetchAttendance = async () => {
      try {
        const token =
          typeof window !== "undefined" ? localStorage.getItem("token") : null;

        if (!token) {
          console.warn("No auth token found for attendance fetch");
          setAttendanceRecords([]);
          return;
        }

        const res = await fetch("/Api/student/attendanceData", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ studentIds: [userId] }),
        });

        if (!res.ok) {
          console.error("Failed to fetch attendance:", res.status);
          setAttendanceRecords([]);
          return;
        }

        const data = await res.json();
        const uid = String(userId);
        const attendanceForUser =
          (data && data.data && data.data[uid]) || [];

        setAttendanceRecords(
          Array.isArray(attendanceForUser) ? attendanceForUser : []
        );
      } catch (err) {
        console.error("Failed to fetch attendance:", err);
        setAttendanceRecords([]);
      }
    };

    fetchAttendance();
  }, [userId]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    async function fetchUser() {
      const res = await fetch("/Api/users/user");
      const data = await res.json();
      setUserId(data.user?._id);
      if (data.user) {
        setUserData(data.user);
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    const loadMyData = async () => {
      try {
        setLoading(true);
        const [essentialsRes, assignmentsRes] = await Promise.all([
          fetch("/Api/users/essentials"),
          fetch("/Api/assignment"),
        ]);

        // classes
        if (essentialsRes.ok) {
          const essentialsJson = await essentialsRes.json();
          setMyClasses(essentialsJson.classDetails || []); // future classes only
        } else {
          setMyClasses([]);
        }

        // assignments
        if (assignmentsRes.ok) {
          const assignmentsJson = await assignmentsRes.json();
          const list = assignmentsJson?.data?.assignments || [];
          setMyAssignments(Array.isArray(list) ? list : []);
        } else {
          setMyAssignments([]);
        }
      } catch (e) {
        console.error("Failed to load student schedule:", e);
        setMyClasses([]);
        setMyAssignments([]);
      } finally {
        setLoading(false);
      }
    };

    loadMyData();
  }, []);

  const userTz = userData?.timezone || getUserTimeZone();
  const cloneDate = (d) => new Date(d.getTime());

  // Get days for current week (Mon - Sun)
  const getWeekDays = () => {
    const ref = cloneDate(currentDate);
    const day = ref.getDay();
    const diff = ref.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const startOfWeek = cloneDate(ref);
    startOfWeek.setDate(diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = cloneDate(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  };

  // Generate month days for Month view
  const generateMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay(); // Sunday=0
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  };

  // Helper to get date components in user's timezone
  const getDateComponentsInTz = (date: Date | string, tz: string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    return { year, month, day };
  };

  // Filter helpers for week/day - compare in user's timezone
  const isSameDayInTz = (date1: Date | string, date2: Date, tz: string) => {
    const d1 = getDateComponentsInTz(date1, tz);
    const d2 = getDateComponentsInTz(date2, tz);
    return d1.year === d2.year && d1.month === d2.month && d1.day === d2.day;
  };

  const getMyClassesForDate = (date: Date) => {
    return myClasses.filter((cls) => {
      if (!cls?.startTime) return false;
      return isSameDayInTz(cls.startTime, date, userTz);
    });
  };

  const getMyAssignmentsForDate = (date: Date) => {
    return myAssignments.filter((a) => {
      if (!a?.deadline || a?.status === true) return false; 
      return isSameDayInTz(a.deadline, date, userTz);
    });
  };

  const changeDay = (deltaDays) => {
    const d = cloneDate(currentDate);
    d.setDate(d.getDate() + deltaDays);
    setCurrentDate(d);
  };

  // Unified navigation: prev / today / next that respect activeView ('day'|'week'|'month')
  const handlePrev = () => {
    if (activeView === "month") {
      // go to previous month (keep to first day of that month for consistent month view)
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (activeView === "week") {
      // shift one week back
      const d = cloneDate(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      changeDay(-1);
    }
  };

  const handleNext = () => {
    if (activeView === "month") {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (activeView === "week") {
      const d = cloneDate(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      changeDay(1);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const formatTime = (startTime, endTime) => {
    if (!startTime) return "";
    return formatTimeRangeInTz(startTime, endTime, userTz);
  };

  const getInitials = (name) => {
    if (!name) return "NA";
    return name
      .split(" ")
      .map((n) => n[0] || "")
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleJoinMeeting = async (classId: string) => {
    try {
      if (!userData) {
        toast.error("User data not available. Please refresh the page.");
        return;
      }

      console.log("[Meeting] Creating meeting for class:", classId);
      const response = await fetch("/Api/meeting/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          classId: classId,
          userId: userData._id,
          userRole: userData.category,
        }),
      });

      const data = await response.json();
      console.log("[Meeting] Server response:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to create meeting");
      }

      window.open(
        `/student/video-call?url=${encodeURIComponent(data.url)}&userRole=${
          userData.category
        }&token=${encodeURIComponent(data.token || "")}`,
        '_blank'
      );
    } catch (error: any) {
      console.error("[Meeting] Error details:", error);
      toast.error(
        error.message || "Failed to create meeting. Please try again."
      );
    }
  };

  const weekDays = activeView === "day" ? [currentDate] : getWeekDays();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const gridTemplate = {
    gridTemplateColumns: "200px repeat(7, minmax(0, 1fr))",
  };

  // Replace your getStatusColor function with:
  const getStatusColor = (status: string) => {
    switch (status) {
      case "present":
        return STATUS_COLORS.present;
      case "absent":
        return STATUS_COLORS.absent;
      case "cancelled":
      case "canceled":
        return STATUS_COLORS.cancelled;
      case "rescheduled":
        return STATUS_COLORS.rescheduled;
      case "edited":
        return STATUS_COLORS.edited;
      case "rescheduled_present":
        return STATUS_COLORS.rescheduled_present;
      case "pending":
      default:
        return STATUS_COLORS.pending;
    }
  };
  
  // Resolve attendance/status for a class (prefers explicit class.status for canceled/rescheduled, otherwise attendance records)
  const getClassAttendanceStatus = (classItem: any) => {
    const rawStatus = (classItem?.status || "").toString().toLowerCase();
    let attendanceStatus = "pending";

    if (attendanceRecords && attendanceRecords.length > 0) {
      const classRecord = attendanceRecords.find(
        (rec) => rec.classId === classItem._id || rec.sessionId === classItem._id
      );

      if (classRecord) {
        attendanceStatus = (classRecord.status || "pending")
          .toString()
          .toLowerCase();
      }
    }

    if (rawStatus === "canceled" || rawStatus === "cancelled") {
      return "cancelled";
    }

    if (rawStatus === "reschedule" || rawStatus === "rescheduled") {
      if (classItem.feedbackId && attendanceStatus === "present") {
        return "rescheduled_present";
      }
      return "rescheduled";
    }

    if (rawStatus === "edited") {
      return "rescheduled";
    }

    return attendanceStatus;
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 flex text-gray-900">
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}

      {/* Main Content */}
      <div className="flex-1 min-h-screen align-items-center">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 p-4 sticky top-0 z-10 flex items-center gap-2">
          <Link
                                    href={`/student`}
                                    className="!p-2 !rounded-full !bg-gray-200 !hover:bg-gray-300 !transition-colors !shadow-md !flex-shrink-0"
                                  >
                                    <ChevronLeft className="!text-gray-700 !w-5 !h-5 !sm:w-6 !sm:h-6" />
                                  </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 m-0 p-0">
            Student Calendar
          </h1>
          {isMobile && (
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-gray-100 md:hidden"
            >
              <Menu size={24} />
            </button>
          )}
        </header>

        {/* Content Area */}
        <main className="p-4 sm:p-6">
          {/* Calendar Container */}
          <div className="bg-white rounded-lg shadow-md p-6">
            {/* Top Navigation Bar */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4 text-[20px] text-[#212121]">
                {/* prev / label / next / today */}
                <button
                  onClick={handlePrev}
                  className="cursor-pointer select-none hover:bg-gray-100 p-2 rounded"
                >
                  {"<"}
                </button>
                <span className="font-medium text-[20px] text-[#212121]">
                  {currentDate.toLocaleDateString("en-US", {
                    day: "2-digit",
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                  })}
                </span>
                <button
                  onClick={handleNext}
                  className="cursor-pointer select-none hover:bg-gray-100 p-2 rounded"
                >
                  {">"}
                </button>
                <button onClick={handleToday} className="ml-3 px-3 py-1 rounded bg-gray-100 text-sm">
                  Today
                </button>
              </div>

              {/* View toggle buttons */}
              <div className="inline-flex items-center gap-2">
                <button
                  onClick={() => handleSetView("day")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeView === "day"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Day
                </button>
                <button
                  onClick={() => handleSetView("week")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeView === "week"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => handleSetView("month")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeView === "month"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Month
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="mt-2 rounded overflow-hidden">
              {activeView === "month" ? (
                <div className="bg-white p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">
                      {currentDate.toLocaleString("en-US", { month: "long", year: "numeric" })}
                    </h3>
                    {/* <div className="flex gap-2">
                      <button onClick={handlePrev} className="px-3 py-1 rounded bg-gray-100">Prev</button>
                      <button onClick={handleToday} className="px-3 py-1 rounded bg-gray-100">Today</button>
                      <button onClick={handleNext} className="px-3 py-1 rounded bg-gray-100">Next</button>
                    </div> */}
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-xs text-center text-gray-500 mb-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="py-2">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {generateMonthDays(currentDate).map((d, idx) => {
                      const classCount = d ? getMyClassesForDate(d).length : 0;
                      const assignmentCount = d ? getMyAssignmentsForDate(d).length : 0;
                      const hasItems = classCount + assignmentCount;

                      return (
                        <div
                          key={idx}
                          // clickable whole cell to open day
                          onClick={() => {
                            if (!d) return;
                            setCurrentDate(d);
                            setActiveView("day");
                          }}
                          className={`min-h-[88px] p-2 border rounded ${d ? "bg-white cursor-pointer hover:bg-gray-50" : "bg-transparent"}`}
                        >
                          {d ? (
                            <>
                              <div className="text-sm font-medium">{d.getDate()}</div>

                              <div className="mt-2 text-xs text-gray-600">
                                {hasItems > 0 ? (
                                  <div className="flex flex-col gap-1">
                                    <span className="inline-block px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                                      {classCount} class{classCount !== 1 ? "es" : ""}
                                    </span>
                                    <span className="inline-block px-2 py-1 bg-yellow-50 text-yellow-700 rounded text-xs">
                                      {assignmentCount} assignment{assignmentCount !== 1 ? "s" : ""}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  {/* Header Row */}
                  <div className="grid items-stretch bg-white" style={gridTemplate}>
                    {/* Label cell */}
                    <div className="p-3 bg-white flex items-center font-medium text-[#212121]">
                      My Schedule
                    </div>
                    {/* Week Day Headers */}
                    {weekDays.map((day, idx) => (
                      <div key={idx} className="p-3 text-center bg-[#F5F5F5]">
                        <div className="text-[16px] font-inter font-medium text-[#212121]">
                          {formatInTz(day, userTz, { day: "2-digit", weekday: "short" })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Calendar Body: single row (student) */}
                  <div
                    className="grid items-start bg-white border-t"
                    style={gridTemplate}
                  >
                    {/* Row label */}
                    <div className="p-3 border-r border-gray-200 flex items-center">
                      Upcoming Classes & Due Assignments
                    </div>

                    {/* Day cells */}
                    {weekDays.map((day, idx) => {
                      const dayClasses = getMyClassesForDate(day);
                      const dayAssignments = getMyAssignmentsForDate(day);
                      const empty =
                        dayClasses.length === 0 && dayAssignments.length === 0;
                      return (
                        <div key={idx} className="p-3 min-h-[120px]">
                          {empty ? (
                            <div className="h-full flex items-center justify-center">
                              <div className="text-[12px] text-[#E0E0E0]">
                                No items
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Classes */}
                              {dayClasses.map((classItem, cIdx) => {
                                const attendanceStatus = getClassAttendanceStatus(classItem);
                                const statusColor = getStatusColor(attendanceStatus);

                                return (
                                  <div
                                    key={classItem._id || `c-${cIdx}`}
                                    className={`mb-2 p-2 ${statusColor.bg} border-l-4 ${statusColor.border} text-xs text-[#212121] rounded-md shadow-sm hover:cursor-pointer hover:opacity-90 ${statusColor.strikethrough ? 'overflow-hidden relative' : ''}`}
                                    title={`${classItem.title || "Class"} - ${formatTime(classItem.startTime, classItem.endTime)}`}
                                    onClick={() => handleJoinMeeting(classItem._id)}
                                  >
                                    {statusColor.strikethrough && (
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="w-full h-[2px] bg-red-500 transform rotate-[-15deg]" />
                                      </div>
                                    )}
                                     <div className="flex items-center justify-between gap-2">
                                       <div className="font-medium text-[13px] truncate">{classItem.title || "Class"}</div>
                                       <span className={`w-2 h-2 rounded-full ${statusColor.dot}`} title={attendanceStatus}></span>
                                     </div>
                                    <div className="text-[11px] text-gray-600 truncate">{formatTime(classItem.startTime, classItem.endTime)}</div>

                                    {classItem.reasonForReschedule &&
                                      (classItem.status === "rescheduled" ||
                                        classItem.status === "edited") && (
                                      <div className="mt-1 text-[10px] text-yellow-700 bg-yellow-50 p-1 rounded">
                                        <span className="font-semibold">Rescheduled:</span>{" "}
                                        {classItem.reasonForReschedule}
                                      </div>
                                    )}

                                    {classItem.reasonForCancelation && (classItem.status === "canceled" || classItem.status === "cancelled") && (
                                      <div className="mt-1 text-[10px] text-red-700 bg-red-50 p-1 rounded">
                                        <span className="font-semibold">Cancelled:</span> {classItem.reasonForCancelation}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Assignments */}
                              {dayAssignments.map((a, aIdx) => (
                                <div
                                  key={a._id || `a-${aIdx}`}
                                  className="mb-2 p-2 bg-purple-50 border-l-4 border-purple-500 text-xs text-[#212121] rounded-md shadow-sm"
                                  title={`${
                                    a.title || "Assignment"
                                  } - Due ${new Date(a.deadline).toLocaleTimeString(
                                    "en-US",
                                    {
                                      hour: "numeric",
                                      minute: "2-digit",
                                      hour12: true,
                                      timeZone: "UTC",
                                    }
                                  )}`}
                                >
                                  <div className="font-medium text-[13px] truncate">
                                    {a.title || "Assignment"}
                                  </div>
                                  <div className="text-[11px] text-gray-600 truncate">
                                    Due{" "}
                                    {new Date(a.deadline).toLocaleTimeString(
                                      "en-US",
                                      {
                                        hour: "numeric",
                                        minute: "2-digit",
                                        hour12: true,
                                        timeZone: "UTC",
                                      }
                                    )}
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-4 items-center justify-center">
              {Object.entries(STATUS_COLORS).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`inline-block w-4 h-4 rounded-full border ${val.dot} ${val.border}`}></span>
                  <span className={`text-xs text-gray-700 ${val.strikethrough || ""}`}>{val.label}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default StudentCalendarView;
