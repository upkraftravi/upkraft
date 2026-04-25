"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  PlusCircle,
  Clock,
  AlertCircle,
  Menu,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Modal, Button } from "react-bootstrap";
import {
  formatTimeRangeInTz,
  getUserTimeZone,
} from "@/helper/time";
import EditClassModal from "@/app/components/EditClassModal";

// ─── Types ──────────────────────────────────────────────────────────────────

interface UserData {
  _id: string;
  username?: string;
  name?: string;
  email?: string;
  category: string;
  timezone?: string;
}

interface ClassItem {
  _id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  feedbackId?: string;
  course: string;
  status?: string;
  reasonForReschedule?: string;
  reasonForCancelation?: string;
  cancellationReason?: string;
  rescheduleReason?: string;
  studentId?: string;
  recurrenceId?: string;
  student?: { _id: string; username?: string };
  studentName?: string;
  joinLink?: string;
}

interface Student {
  _id: string;
  username?: string;
  email?: string;
  profileImage?: string;
}

interface Course {
  _id: string;
  title?: string;
  name?: string;
}

interface StudentClassBlock {
  studentId: string;
  classes: ClassItem[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
    dot: string;
    label: string;
    strikethrough?: string;
  }
> = {
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

const DEFAULT_STATUS_COLOR = STATUS_COLORS.pending;

// ─── Utility functions (pure, no hooks) ─────────────────────────────────────

function cloneDate(d: Date): Date {
  return new Date(d.getTime());
}

function getDateComponentsInTz(
  date: Date | string,
  tz: string
): { year: number; month: number; day: number } {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  return {
    year: parseInt(parts.find((p) => p.type === "year")?.value || "0"),
    month: parseInt(parts.find((p) => p.type === "month")?.value || "0"),
    day: parseInt(parts.find((p) => p.type === "day")?.value || "0"),
  };
}

function isSameDayInTz(
  date1: Date | string,
  date2: Date,
  tz: string
): boolean {
  const d1 = getDateComponentsInTz(date1, tz);
  const d2 = getDateComponentsInTz(date2, tz);
  return d1.year === d2.year && d1.month === d2.month && d1.day === d2.day;
}

function getWeekDaysForDate(date: Date): Date[] {
  const ref = cloneDate(date);
  const day = ref.getDay();
  const diff = ref.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = cloneDate(ref);
  startOfWeek.setDate(diff);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = cloneDate(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d);
  }
  return days;
}

function generateMonthDays(date: Date): (Date | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++)
    days.push(new Date(year, month, d));
  return days;
}

function getInitials(name?: string): string {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase()
    .substring(0, 2);
}
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}
function getStatusColor(status: string) {
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
    default:
      return DEFAULT_STATUS_COLOR;
  }
}

/** Compute the visible date range (start/end ISO strings) for query params. */
function getVisibleDateRange(
  currentDate: Date,
  view: "day" | "week" | "month"
): { startDate: string; endDate: string } {
  if (view === "day") {
    const start = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate()
    );
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (view === "week") {
    const weekDays = getWeekDaysForDate(currentDate);
    const start = weekDays[0];
    const end = new Date(weekDays[6]);
    end.setDate(end.getDate() + 1);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  // month
  const start = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  );
  const end = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    1
  );
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

// ─── Component ──────────────────────────────────────────────────────────────

const StudentCalendarView = () => {
  const router = useRouter();

  // Core data state
  const [students, setStudents] = useState<Student[]>([]);
  const [allClasses, setAllClasses] = useState<StudentClassBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageLength = 10;

  // Class detail / action modals
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"edit" | "reschedule">("edit");
  const [attendanceMap, setAttendanceMap] = useState<Record<string, any[]>>(
    {}
  );
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // View state
  const [activeView, setActiveView] = useState<"day" | "week" | "month">(
    "week"
  );

  const userTz = useMemo(
    () => userData?.timezone || getUserTimeZone(),
    [userData?.timezone]
  );

  // ─── Memoized computations ───────────────────────────────────────────────

  const weekDays = useMemo(
    () =>
      activeView === "day" ? [currentDate] : getWeekDaysForDate(currentDate),
    [activeView, currentDate]
  );

  const monthDays = useMemo(
    () => generateMonthDays(currentDate),
    [currentDate]
  );

  const filteredStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          (student.username || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          (student.email || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      ),
    [students, searchTerm]
  );

  // Build a fast lookup: studentId → classItem[] (with studentId attached)
  const classLookup = useMemo(() => {
    const map: Record<string, ClassItem[]> = {};
    for (const block of allClasses) {
      map[block.studentId] = (block.classes || []).map((cls) => ({
        ...cls,
        studentId: block.studentId,
      }));
    }
    return map;
  }, [allClasses]);

  // ─── Data fetching ────────────────────────────────────────────────────────

  // const fetchStudents = useCallback(async (page = 1): Promise<Student[]> => {
  //   try {
  //     const response = await fetch(
  //       `/Api/myStudents?page=${page}&pageLength=${pageLength}`
  //     );
  //     const data = await response.json();
  //     if (data.success) {
  //       const list = data.filteredUsers || [];
  //       setStudents(list);
  //       setTotalPages(data.totalPages || 1);
  //       setTotalCount(data.totalCount || 0);
  //       setCurrentPage(data.currentPage || page);
  //       return list;
  //     }
  //   } catch (error) {
  //     console.error("Error fetching students:", error);
  //   }
  //   return [];
  // }, [pageLength]);

  const fetchStudents = useCallback(async (page = 1, search = ""): Promise<Student[]> => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageLength: String(pageLength),
        ...(search.trim() && { search: search.trim() }),
      });
      const response = await fetch(`/Api/myStudents?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        const list = data.filteredUsers || [];
        setStudents(list);
        setTotalPages(data.totalPages || 1);
        setTotalCount(data.totalCount || 0);
        setCurrentPage(data.currentPage || page);
        return list;
      }
    } catch (error) {
      console.error("Error fetching students:", error);
    }
    return [];
  }, [pageLength]);

  // ─── OPTIMIZED: single batch request instead of N parallel calls ────────
  // const fetchAttendanceForStudents = useCallback(
  //   async (studentList: Student[]) => {
  //     if (studentList.length === 0) return;

  //     try {
  //       const studentIds = studentList.map((s) => s._id).join(",");

  //       const res = await fetch(
  //         `/Api/student/attendanceData?studentIds=${encodeURIComponent(studentIds)}`
  //       );

  //       if (!res.ok) {
  //         console.error("Failed to fetch batch attendance:", res.status);
  //         return;
  //       }

  //       const data = await res.json();

  //       // API returns: { success: true, data: { [studentId]: attendance[] } }
  //       if (data.success && data.data) {
  //         setAttendanceMap(data.data);
  //       }
  //     } catch (error) {
  //       console.error("Error fetching attendance data:", error);
  //     }
  //   },
  //   [] // no deps — only uses setAttendanceMap (stable setter)
  // );

  const fetchAttendanceForStudents = useCallback(
    async (studentList: Student[]) => {
      if (!studentList.length) return;

      try {
        const token = localStorage.getItem("token");

        const res = await fetch("/Api/student/attendanceData", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            studentIds: studentList.map((s) => s._id),
          }),
        });

        if (!res.ok) {
          console.error("Failed to fetch batch attendance:", res.status);
          return;
        }

        const data = await res.json();

        if (data.success && data.data) {
          setAttendanceMap(data.data);
        }
      } catch (error) {
        console.error("Error fetching attendance data:", error);
      }
    },
    []
  );

  /** Fetch all classes via the bulk endpoint with date-range filtering. */
  const fetchAllClasses = useCallback(
    async (studentList: Student[]) => {
      try {
        if (studentList.length === 0) return;

        const studentIds = studentList.map((s) => s._id).join(",");
        const { startDate, endDate } = getVisibleDateRange(
          currentDate,
          activeView
        );

        const res = await fetch(
          `/Api/calendar/classes?studentIds=${encodeURIComponent(
            studentIds
          )}&startDate=${encodeURIComponent(
            startDate
          )}&endDate=${encodeURIComponent(endDate)}`
        );
        const data = await res.json();

        if (data.data) {
          // Bulk endpoint response
          setAllClasses(data.data);
        } else if (data.classData) {
          // Single-student fallback
          setAllClasses([
            { studentId: studentIds, classes: data.classData },
          ]);
        }

        // Fetch attendance in parallel (non-blocking)
        fetchAttendanceForStudents(studentList);
      } catch (error) {
        console.error("Error fetching classes:", error);
      }
    },
    [currentDate, activeView, fetchAttendanceForStudents]
  );

  // ─── Attendance helpers ───────────────────────────────────────────────────

  const getClassAttendanceStatus = useCallback(
    (classItem: ClassItem): string => {
      const rawStatus = (classItem?.status || "").toString().toLowerCase();
      const studentId = classItem.studentId || classItem.student?._id;
      let attendanceStatus = "pending";

      if (studentId && attendanceMap[studentId]) {
        const classRecord = attendanceMap[studentId].find(
          (record: any) =>
            record.classId === classItem._id ||
            record.sessionId === classItem._id
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
    },
    [attendanceMap]
  );

  const getClassesForDate = useCallback(
    (studentId: string, date: Date): ClassItem[] => {
      const studentClasses = classLookup[studentId];
      if (!studentClasses) return [];
      return studentClasses.filter(
        (cls) => cls.startTime && isSameDayInTz(cls.startTime, date, userTz)
      );
    },
    [classLookup, userTz]
  );

  // ─── Navigation handlers ─────────────────────────────────────────────────

  const handlePrev = useCallback(() => {
    if (activeView === "month") {
      setCurrentDate(
        new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
      );
    } else if (activeView === "week") {
      const d = cloneDate(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      const d = cloneDate(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
    }
  }, [activeView, currentDate]);

  const handleNext = useCallback(() => {
    if (activeView === "month") {
      setCurrentDate(
        new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
      );
    } else if (activeView === "week") {
      const d = cloneDate(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      const d = cloneDate(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
    }
  }, [activeView, currentDate]);

  const handleToday = useCallback(() => setCurrentDate(new Date()), []);

  const handleSetView = useCallback(
    (v: "day" | "week" | "month") => setActiveView(v),
    []
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 1 || newPage > totalPages) return;
      setLoading(true);
      fetchStudents(newPage).then((list) => {
        if (list.length > 0) fetchAllClasses(list);
        setLoading(false);
      });
    },
    [totalPages, fetchStudents, fetchAllClasses]
  );

  // ─── Modal handlers ──────────────────────────────────────────────────────

  const handleOpenCourseModal = useCallback(() => {
    setShowCourseModal(true);
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0]._id);
    }
  }, [selectedCourseId, courses]);

  const handleCloseCourseModal = useCallback(
    () => setShowCourseModal(false),
    []
  );

  const handleConfirmCreateClass = useCallback(() => {
    if (!selectedCourseId) {
      toast.error("Please select a course");
      return;
    }
    setShowCourseModal(false);
    router.push(`/tutor/classes?page=add-session&courseId=${selectedCourseId}`);
  }, [selectedCourseId, router]);

  const handleClassClick = useCallback((classItem: ClassItem) => {
    setSelectedClass(classItem);
    setShowClassModal(true);
  }, []);

  const handleCloseClassModal = useCallback(() => {
    setShowClassModal(false);
    setSelectedClass(null);
  }, []);

  const handleEditClass = useCallback((mode: "edit" | "reschedule" = "edit") => {
    if (!selectedClass) {
      toast.error("No class selected");
      return;
    }
    setEditMode(mode);
    setEditingClassId(selectedClass._id);
    setShowEditModal(true);
    setShowClassModal(false);
    setRescheduleReason("");
  }, [selectedClass]);

  const formatTime = useCallback(
    (startTime?: string, endTime?: string): string => {
      if (!startTime) return "";
      return formatTimeRangeInTz(startTime, endTime, userTz);
    },
    [userTz]
  );

  // ─── Cancel class handler ─────────────────────────────────────────────────

  const handleCancelClass = useCallback(
    async (
      reasonOrEvent: any,
      cancelType: "single" | "all" | "following" = "single"
    ) => {
      if (!selectedClass || isCancelling) return;

      const finalReason =
        typeof reasonOrEvent === "string"
          ? reasonOrEvent.trim()
          : rescheduleReason.trim();

      if (!finalReason) {
        toast.error("Please provide a reason for cancellation");
        return;
      }

      const classId = selectedClass._id;
      const selectedStart = selectedClass.startTime
        ? new Date(selectedClass.startTime).getTime()
        : 0;
      const recurrenceId = selectedClass.recurrenceId ?? null;
      let prevAllClasses: StudentClassBlock[] | null = null;

      // Optimistic UI for single-event cancel
      if (cancelType === "single") {
        prevAllClasses = allClasses;
        setAllClasses((prev) =>
          prev.map((block) => ({
            ...block,
            classes: block.classes.map((cls) =>
              cls._id === classId
                ? { ...cls, status: "cancelled", cancellationReason: finalReason }
                : cls
            ),
          }))
        );
        setSelectedClass((prev) =>
          prev && prev._id === classId
            ? { ...prev, status: "cancelled", cancellationReason: finalReason }
            : prev
        );
      }

      // Optimistic UI for "following"
      if (cancelType === "following" && recurrenceId) {
        prevAllClasses = allClasses;
        setAllClasses((prev) =>
          prev.map((block) => ({
            ...block,
            classes: block.classes.map((cls) => {
              if (cls.recurrenceId !== recurrenceId) return cls;
              const clsStart = cls.startTime
                ? new Date(cls.startTime).getTime()
                : 0;
              if (clsStart < selectedStart) return cls;
              return {
                ...cls,
                status: "cancelled",
                cancellationReason: finalReason,
              };
            }),
          }))
        );
        setSelectedClass((prev) =>
          prev && prev._id === classId
            ? { ...prev, status: "cancelled", cancellationReason: finalReason }
            : prev
        );
      }

      setShowCancelModal(false);
      setShowClassModal(false);
      setIsCancelling(true);

      try {
        const timezone =
          userData?.timezone ||
          getUserTimeZone() ||
          Intl.DateTimeFormat().resolvedOptions().timeZone;

        const res = await fetch(
          `/Api/classes?classId=${encodeURIComponent(
            classId
          )}&deleteType=${encodeURIComponent(cancelType)}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reasonForCancellation: finalReason,
              timezone,
            }),
          }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || data.message || "Failed to cancel class"
          );
        }

        toast.success(
          cancelType === "all"
            ? "All events in this series have been cancelled"
            : cancelType === "following"
              ? "Events from this date onward have been cancelled"
              : "Class cancelled"
        );

        // Background refresh
        fetchStudents(currentPage).then((list) => {
          if (list.length > 0) fetchAllClasses(list);
        });
      } catch (err: any) {
        console.error("Cancel error:", err);
        toast.error(err.message || "Failed to cancel class");
        if (
          (cancelType === "single" || cancelType === "following") &&
          prevAllClasses
        ) {
          setAllClasses(prevAllClasses);
        }
      } finally {
        setIsCancelling(false);
      }
    },
    [
      selectedClass,
      isCancelling,
      rescheduleReason,
      allClasses,
      userData,
      fetchStudents,
      fetchAllClasses,
    ]
  );

  // ─── Delete class handler ─────────────────────────────────────────────────

  const handleDeleteClass = useCallback(
    async (type: "single" | "all") => {
      if (!selectedClass) return;

      try {
        const classId = selectedClass._id;
        const res = await fetch(
          `/Api/calendar/classes?classId=${encodeURIComponent(
            classId
          )}&deleteType=${encodeURIComponent(type)}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );

        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.error || data.message || "Failed to delete class"
          );

        toast.success(
          type === "single" ? "Deleted this event" : "Deleted all events"
        );
        setShowDeleteModal(false);
        setShowClassModal(false);
        setSelectedClass(null);

        const studentList = await fetchStudents(currentPage);
        if (studentList.length > 0) await fetchAllClasses(studentList);
      } catch (err: any) {
        console.error("Delete error:", err);
        toast.error(err.message || "Failed to delete class");
      }
    },
    [selectedClass, fetchStudents, fetchAllClasses]
  );

  // ─── Edit success handler ─────────────────────────────────────────────────

  const handleEditSuccess = useCallback(
    async (updatedData?: Partial<ClassItem>) => {
      const classId = editingClassId;

      if (classId) {
        setAllClasses((prev) =>
          prev.map((block) => ({
            ...block,
            classes: block.classes.map((cls) =>
              cls._id === classId ? { ...cls, ...(updatedData || {}) } : cls
            ),
          }))
        );

        setSelectedClass((prev) =>
          prev && prev._id === classId
            ? { ...prev, ...(updatedData || {}) }
            : prev
        );
      }

      setShowEditModal(false);
      setEditingClassId(null);
      setRescheduleReason("");
      toast.success("Class updated");

      // Background sync
      (async () => {
        try {
          const studentList = await fetchStudents(currentPage);
          if (studentList.length > 0) await fetchAllClasses(studentList);
        } catch (err) {
          console.error("Refresh after edit failed:", err);
          toast.error("Server sync failed, please refresh");
        }
      })();
    },
    [editingClassId, rescheduleReason, fetchStudents, fetchAllClasses]
  );

  // ─── Join meeting ─────────────────────────────────────────────────────────

  const handleJoinMeeting = useCallback(
    async (classId: string) => {
      try {
        if (!userData) {
          toast.error("User data not available. Please refresh the page.");
          return;
        }

        const response = await fetch("/Api/meeting/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId,
            userId: userData._id,
            userRole: userData.category,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to create meeting");
        }

        window.open(
          `/tutor/video-call?url=${encodeURIComponent(
            data.url
          )}&userRole=${userData.category}&token=${encodeURIComponent(
            data.token || ""
          )}`,
          "_blank"
        );
      } catch (error: any) {
        console.error("[Meeting] Error:", error);
        toast.error(
          error.message || "Failed to create meeting. Please try again."
        );
      }
    },
    [userData]
  );

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Responsive layout
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch courses + user data (one-time)
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch("/Api/tutors/courses");
        const data = await res.json();
        if (data.course) setCourses(data.course);
      } catch (error) {
        console.error("Error fetching courses:", error);
      }
    };

    const fetchUserData = async () => {
      try {
        const res = await fetch("/Api/users/user");
        const data = await res.json();
        if (data.user) setUserData(data.user);
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchCourses();
    fetchUserData();
  }, []);

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const studentList = await fetchStudents(1); // pass page 1
      if (studentList.length > 0) {
        await fetchAllClasses(studentList);
      }
      setLoading(false);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const debouncedSearch = useDebounce(searchTerm, 400);

  useEffect(() => {
    setCurrentPage(1);
    fetchStudents(1, debouncedSearch).then((list) => {
      if (list.length > 0) fetchAllClasses(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);


  // Refetch classes when date or view changes (date-range filtering)
  useEffect(() => {
    if (students.length > 0 && !loading) {
      fetchAllClasses(students);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, activeView]);

  const toggleSidebar = useCallback(
    () => setSidebarOpen((prev) => !prev),
    []
  );

  // Grid template for day/week view
  const gridTemplate = useMemo(
    () => ({
      gridTemplateColumns: "263px repeat(7, minmax(0, 1fr))",
    }),
    []
  );

  // ─── Loading screen ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full bg-gray-50 flex text-gray-900">
      {/* Global cancelling overlay */}
      {isCancelling && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg px-6 py-4 flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-gray-700">
              Cancelling classes in this series…
            </div>
          </div>
        </div>
      )}

      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-screen">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 p-4 sm:p-6 sticky top-0 z-10 flex items-center gap-5px">
          <Link
            href="/tutor"
            className="!p-2 !rounded-full !bg-gray-200 !hover:bg-gray-300 !transition-colors !shadow-md !flex-shrink-0"
          >
            <ChevronLeft className="!text-gray-700 !w-5 !h-5 !sm:w-6 !sm:h-6" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Tutor Calendar
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
                <button
                  onClick={handleToday}
                  className="ml-3 px-3 py-1 rounded bg-gray-100 text-sm"
                >
                  Today
                </button>
              </div>

              {/* View toggle buttons */}
              <div className="inline-flex items-center gap-2">
                {(["day", "week", "month"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => handleSetView(v)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeView === v
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                      }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Create Class Button + Course Select Modal */}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={handleOpenCourseModal}
                className="!bg-purple-600 hover:!bg-purple-700 !text-white !px-4 !py-2 !rounded-lg !flex !items-center !gap-2 !text-sm !font-medium"
              >
                <PlusCircle size={18} />
                Create Class
              </button>

              <Modal
                show={showCourseModal}
                onHide={handleCloseCourseModal}
                centered
                className="modal-common-sec"
                animation
                backdrop
                keyboard
              >
                <Modal.Header closeButton />
                <Modal.Body>
                  <div className="head-modal text-center">
                    <h2>Select Course</h2>
                    <p>Choose a course to create a new class session.</p>
                  </div>
                  <div className="form-box-modal label-strong-box">
                    <div className="row">
                      <div className="col-md-12">
                        <label className="w-100 d-block mb-2">Course</label>
                        <select
                          value={selectedCourseId}
                          onChange={(e) => setSelectedCourseId(e.target.value)}
                          className="form-select"
                        >
                          {courses.length === 0 && (
                            <option value="">No courses found</option>
                          )}
                          {courses.map((course) => (
                            <option key={course._id} value={course._id}>
                              {course.title || course.name || "Untitled Course"}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <button onClick={handleCloseCourseModal}>Cancel</button>
                  <button
                    disabled={!selectedCourseId}
                    onClick={handleConfirmCreateClass}
                  >
                    Continue
                  </button>
                </Modal.Footer>
              </Modal>
            </div>

            {/* ─── Calendar Grid ─── */}
            <div className="mt-2 rounded overflow-hidden">
              {activeView === "month" ? (
                /* ── Month View ── */
                <div className="bg-white p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">
                      {currentDate.toLocaleString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h3>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-xs text-center text-gray-500 mb-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (d) => (
                        <div key={d} className="py-2">
                          {d}
                        </div>
                      )
                    )}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {monthDays.map((d, idx) => {
                      const classCount = d
                        ? filteredStudents.reduce(
                          (acc, s) =>
                            acc + getClassesForDate(s._id, d).length,
                          0
                        )
                        : 0;

                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            if (!d) return;
                            setCurrentDate(d);
                            setActiveView("day");
                          }}
                          className={`min-h-[88px] p-2 border rounded ${d
                            ? "bg-white cursor-pointer hover:bg-gray-50"
                            : "bg-transparent"
                            }`}
                        >
                          {d ? (
                            <>
                              <div className="text-sm font-medium">
                                {d.getDate()}
                              </div>
                              <div className="mt-2 text-xs text-gray-600">
                                {classCount > 0 ? (
                                  <span className="inline-block px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                                    {classCount} class
                                    {classCount !== 1 ? "es" : ""}
                                  </span>
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
                /* ── Day / Week View ── */
                <>
                  {/* Header Row */}
                  <div
                    className="grid items-stretch bg-white"
                    style={gridTemplate}
                  >
                    {/* Search Input Cell */}
                    <div className="p-3 bg-white">
                      <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        type="text"
                        placeholder="Search Students"
                        className="w-full h-[48px] px-4 rounded border border-[#505050] text-[14px] text-[#505050] bg-white font-inter font-normal focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    {/* Day headers */}
                    {weekDays.map((day, idx) => (
                      <div key={idx} className="p-3 text-center bg-[#F5F5F5]">
                        <div className="text-[16px] font-inter font-medium text-[#212121]">
                          {day.toLocaleDateString("en-US", {
                            day: "2-digit",
                            weekday: "short",
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Calendar Body */}
                  <div className="max-h-[70vh] overflow-auto">
                    {filteredStudents.length === 0 ? (
                      <div className="p-8 text-center">
                        <div className="text-[16px] text-[#9B9B9B] mb-2">
                          No students to display
                        </div>
                        <div className="text-[14px] text-[#C4C4C4]">
                          {searchTerm
                            ? "Try adjusting your search terms"
                            : "No students found in the system"}
                        </div>
                      </div>
                    ) : (
                      filteredStudents.map((student) => (
                        <div
                          key={student._id}
                          className="grid items-center hover:bg-gray-50 transition-colors"
                          style={gridTemplate}
                        >
                          {/* Student Info Cell */}
                          <div className="p-3 flex items-center gap-3 min-h-[88px] border-r border-gray-200">
                            {student.profileImage ? (
                              <img
                                src={student.profileImage}
                                alt={student.username}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-medium text-purple-800">
                                {getInitials(student.username)}
                              </div>
                            )}
                            <div>
                              <div className="text-[14px] text-[#212121] font-medium">
                                {student.username}
                              </div>
                            </div>
                          </div>

                          {/* Daily Schedule Cells */}
                          {weekDays.map((day, idx) => {
                            const classes = getClassesForDate(
                              student._id,
                              day
                            );
                            return (
                              <div key={idx} className="p-3 min-h-[88px]">
                                {classes.length === 0 ? (
                                  <div className="h-full flex items-center justify-center">
                                    <div className="text-[12px] text-[#E0E0E0]">
                                      No classes
                                    </div>
                                  </div>
                                ) : (
                                  classes.map((classItem, cIdx) => {
                                    const attendanceStatus =
                                      getClassAttendanceStatus(classItem);
                                    const statusColor =
                                      getStatusColor(attendanceStatus);
                                    return (
                                      <div
                                        key={classItem._id || cIdx}
                                        className={`mb-2 last:mb-0 p-2 ${statusColor.bg} border-l-4 ${statusColor.border} hover:opacity-90 text-xs text-[#212121] rounded-md shadow-sm hover:shadow-md transition-all cursor-pointer relative`}
                                        title={`${classItem.title || "Class"
                                          } - ${formatTime(
                                            classItem.startTime,
                                            classItem.endTime
                                          )}`}
                                        onClick={() =>
                                          handleClassClick(classItem)
                                        }
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div
                                            className={`font-medium text-[13px] truncate ${statusColor.strikethrough
                                              ? "line-through"
                                              : ""
                                              } ${statusColor.text}`}
                                          >
                                            {classItem.title || "Class"}
                                          </div>
                                          <span
                                            className={`w-2 h-2 rounded-full ${statusColor.dot}`}
                                            title={attendanceStatus}
                                          ></span>
                                        </div>
                                        <div
                                          className={`text-[11px] truncate ${statusColor.strikethrough
                                            ? "line-through"
                                            : "text-gray-600"
                                            }`}
                                        >
                                          {formatTime(
                                            classItem.startTime,
                                            classItem.endTime
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Status Legend */}
            <div className="mt-6 flex flex-wrap gap-4 items-center justify-center">
              {Object.entries(STATUS_COLORS).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className={`inline-block w-4 h-4 rounded-full border ${val.dot} ${val.border}`}
                  ></span>
                  <span
                    className={`text-xs text-gray-700 ${val.strikethrough || ""
                      }`}
                  >
                    {val.label}
                  </span>
                </div>
              ))}
            </div>
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100 pt-4">
                <div className="text-sm text-gray-500">
                  Showing{" "}
                  <span className="font-medium text-gray-700">
                    {(currentPage - 1) * pageLength + 1}
                  </span>{" "}
                  –{" "}
                  <span className="font-medium text-gray-700">
                    {Math.min(currentPage * pageLength, totalCount)}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-gray-700">{totalCount}</span>{" "}
                  students
                </div>

                <div className="flex items-center gap-1">
                  {/* First */}
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    «
                  </button>

                  {/* Prev */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Prev
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === totalPages ||
                        Math.abs(p - currentPage) <= 1
                    )
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                        acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "..." ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => handlePageChange(p as number)}
                          className={`w-8 h-8 text-xs rounded border transition-all ${currentPage === p
                            ? "bg-purple-600 text-white border-purple-600 font-semibold"
                            : "border-gray-200 hover:bg-gray-100 text-gray-700"
                            }`}
                        >
                          {p}
                        </button>
                      )
                    )}

                  {/* Next */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ›
                  </button>

                  {/* Last */}
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ─── Class Options Modal ─── */}
      <Modal
        show={showClassModal}
        onHide={handleCloseClassModal}
        centered
        dialogClassName="max-w-lg"
      >
        <Modal.Header closeButton className="border-0 pb-0">
          <div className="flex items-start justify-between w-full">
            <div>
              <h5 className="mb-0 text-lg font-semibold">
                {selectedClass?.title || "Class"}
              </h5>
              <div className="text-sm text-gray-500 mt-1">
                {selectedClass?.studentName ||
                  selectedClass?.student?.username ||
                  ""}
              </div>
            </div>
            {selectedClass &&
              (() => {
                const attendanceStatus =
                  getClassAttendanceStatus(selectedClass);
                const sc = getStatusColor(attendanceStatus);
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.text} border ${sc.border}`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${sc.dot}`}
                    ></span>
                    {sc.label}
                  </span>
                );
              })()}
          </div>
        </Modal.Header>
        <Modal.Body className="pt-2">
          <div className="grid gap-3">
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <Clock className="w-4 h-4 text-gray-500" />
              <div>
                <div className="font-medium">
                  {formatTime(
                    selectedClass?.startTime,
                    selectedClass?.endTime
                  ) || "No time"}
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(
                    selectedClass?.startTime || Date.now()
                  ).toLocaleDateString()}
                </div>
              </div>
            </div>

            {selectedClass?.description && (
              <div className="text-sm text-gray-600">
                {selectedClass.description.length > 220
                  ? `${selectedClass.description.slice(0, 220)}...`
                  : selectedClass.description}
              </div>
            )}

            {selectedClass?.cancellationReason && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="text-xs font-semibold text-red-700 mb-1">
                  Cancellation Reason:
                </div>
                <div className="text-sm text-red-600">
                  {selectedClass.cancellationReason}
                </div>
              </div>
            )}

            {selectedClass?.rescheduleReason && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  Reschedule Reason:
                </div>
                <div className="text-sm text-gray-600">
                  {selectedClass.rescheduleReason}
                </div>
              </div>
            )}

            {selectedClass?.reasonForReschedule &&
              (selectedClass.status === "rescheduled" ||
                selectedClass.status === "edited") && (
              <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-yellow-800 mb-1">
                      Reason for Reschedule
                    </div>
                    <div className="text-sm text-yellow-700">
                      {selectedClass.reasonForReschedule}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedClass?.reasonForCancelation && (
              <div className="p-3 bg-red-50 border-l-4 border-red-400 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-red-800 mb-1">
                      Reason for Cancellation
                    </div>
                    <div className="text-sm text-red-700">
                      {selectedClass.reasonForCancelation}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Buttons row */}
            <div className="flex flex-wrap gap-4 mt-2">
              <Button
                variant="outline-primary"
                className="!rounded-md !py-2 !text-sm"
                onClick={() => handleEditClass("edit")}
              >
                Edit
              </Button>

              <Button
                variant="outline-primary"
                className="!rounded-md !py-2 !text-sm"
                onClick={() => handleEditClass("reschedule")}
              >
                Reschedule
              </Button>

              <Button
                variant="outline-warning"
                className="!rounded-md !py-2 !text-sm"
                onClick={() => setShowCancelModal(true)}
                disabled={
                  selectedClass
                    ? getClassAttendanceStatus(selectedClass) === "cancelled" ||
                    getClassAttendanceStatus(selectedClass) === "canceled"
                    : false
                }
              >
                Cancel
              </Button>

              <Button
                variant="success"
                className="!rounded-md !py-2 !text-sm"
                onClick={() => {
                  if (selectedClass?._id) handleJoinMeeting(selectedClass._id);
                  handleCloseClassModal();
                }}
              >
                Join
              </Button>
            </div>
          </div>
        </Modal.Body>
      </Modal>

      {/* ─── Delete Options Modal ─── */}
      <Modal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        centered
        dialogClassName="max-w-md"
      >
        <Modal.Header closeButton className="border-0 pb-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h5 className="mb-0 text-lg font-semibold">Delete Class</h5>
          </div>
        </Modal.Header>
        <Modal.Body className="pt-2">
          <p className="text-sm text-gray-600 mb-3">
            Are you sure you want to permanently delete this class? This action
            cannot be undone.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="danger"
              className="flex-1 !py-2 !rounded-md"
              onClick={() => handleDeleteClass("single")}
            >
              Delete This Event
            </Button>

            <Button
              variant="outline-danger"
              className="flex-1 !py-2 !rounded-md"
              onClick={() => handleDeleteClass("all")}
            >
              Delete All Events
            </Button>
          </div>

          <div className="mt-3 text-right">
            <button
              className="text-sm text-gray-500 hover:text-gray-700"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </button>
          </div>
        </Modal.Body>
      </Modal>

      {/* ─── Edit Class Modal ─── */}
      <EditClassModal
        show={showEditModal}
        onHide={() => {
          setShowEditModal(false);
          setEditingClassId(null);
          setRescheduleReason("");
        }}
        classId={editingClassId}
        initialData={selectedClass}
        userTimezone={userTz}
        mode={editMode}
        onSuccess={handleEditSuccess}
      />

      {/* ─── Cancel Class Modal ─── */}
      <CancelClassModal
        show={showCancelModal}
        onHide={() => setShowCancelModal(false)}
        onCancel={async (
          reason: string,
          type: "single" | "all" | "following"
        ) => {
          await handleCancelClass(reason, type);
        }}
        disabled={
          selectedClass
            ? getClassAttendanceStatus(selectedClass) === "cancelled" ||
            getClassAttendanceStatus(selectedClass) === "canceled"
            : false
        }
        loading={isCancelling}
      />
    </div>
  );
};

// ─── CancelClassModal (extracted component) ─────────────────────────────────

interface CancelClassModalProps {
  show: boolean;
  onHide: () => void;
  onCancel: (reason: string, type: "single" | "all" | "following") => void;
  disabled?: boolean;
  loading?: boolean;
}

const CancelClassModal = React.memo<CancelClassModalProps>(
  ({ show, onHide, onCancel, disabled, loading }) => {
    const [reason, setReason] = useState("");

    useEffect(() => {
      if (!show) setReason("");
    }, [show]);

    return (
      <Modal show={show} onHide={onHide} centered dialogClassName="max-w-md">
        <Modal.Header closeButton className="border-0 pb-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <h5 className="mb-0 text-lg font-semibold">Cancel Class</h5>
          </div>
        </Modal.Header>
        <Modal.Body className="pt-2">
          <p className="text-sm text-gray-600 mb-3">
            You are about to cancel this class. Students will see it as
            cancelled on their calendar.
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Cancellation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please provide a reason..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              rows={3}
              maxLength={500}
            />
            <div className="text-xs text-gray-400 mt-1">
              {reason.length}/500
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="warning"
              className="flex-1 !py-2 !rounded-md !text-sm"
              onClick={() => onCancel(reason, "single")}
              disabled={!reason.trim() || disabled || loading}
            >
              {loading ? "Cancelling..." : "Cancel This Event"}
            </Button>
            <Button
              variant="secondary"
              className="flex-1 !py-2 !rounded-md !text-sm"
              onClick={() => onCancel(reason, "following")}
              disabled={!reason.trim() || disabled || loading}
            >
              {loading ? "Cancelling..." : "Cancel Following"}
            </Button>

            {/* <Button
              variant="danger"
              className="flex-1 !py-2 !rounded-md !text-sm"
              onClick={() => onCancel(reason, "all")}
              disabled={!reason.trim() || disabled || loading}
            >
              {loading ? "Cancelling..." : "Cancel All Events"}
            </Button> */}
          </div>
        </Modal.Body>
      </Modal>
    );
  }
);

export default StudentCalendarView;
