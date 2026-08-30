cmake_minimum_required(VERSION 3.5)
project(Dodo C)

# Dodo for Macintosh — one chat window per topic, over direct TCP (nettcp) to
# the mini's agent-dodo (:2339), which talks to feynd.cc.
add_application(Dodo dodo.c dodo.r ${CMAKE_CURRENT_SOURCE_DIR}/../net/nettcp.c)
target_include_directories(Dodo PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../net)
set_target_properties(Dodo PROPERTIES COMPILE_OPTIONS -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Dodo PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Dodo PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()
