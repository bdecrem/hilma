cmake_minimum_required(VERSION 3.5)
project(Oracle C)

# Oracle embeds model + tokenizer as resources (one self-contained app).
# nettcp is linked ONLY for analytics (per-reply stats to the mini); it is
# brought up lazily after the load so it cannot block/crash startup.
add_application(Oracle
    oracle.c
    gpt.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../net/nettcp.c
    oracle.r
)
target_include_directories(Oracle PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../../net)

# -O2: at -O0 every int8 multiply is a __mulsi3 library call (~4x slower).
target_compile_options(Oracle PRIVATE
    -O2 -fomit-frame-pointer -fno-strict-aliasing -ffunction-sections)

if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Oracle PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
endif()

target_link_libraries(Oracle m)
