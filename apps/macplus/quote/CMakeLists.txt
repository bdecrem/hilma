cmake_minimum_required(VERSION 3.5)
project(Quote C)

# Quote of the Day app — direct TCP via the shared nettcp library (../net).
add_application(Quote quote.c quote.r ${CMAKE_CURRENT_SOURCE_DIR}/../net/nettcp.c)
target_include_directories(Quote PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../net)
set_target_properties(Quote PROPERTIES COMPILE_OPTIONS -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Quote PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Quote PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()
