cmake_minimum_required(VERSION 3.5)
project(Pixel C)

# Daily Pixel app — direct TCP via the shared nettcp library (../net).
add_application(Pixel pixel.c pixel.r ${CMAKE_CURRENT_SOURCE_DIR}/../net/nettcp.c)
target_include_directories(Pixel PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../net)
set_target_properties(Pixel PROPERTIES COMPILE_OPTIONS -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Pixel PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Pixel PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()
